-- =============================================================================
-- Smart Account 2 · Fase 2: transacciones y saldos
-- El saldo NO se guarda en cada movimiento (en el sistema anterior se descuadraba):
-- se calcula siempre como saldo_inicial + abonos - cargos, en orden de fecha.
-- =============================================================================

create table public.transacciones (
  id                   bigint generated always as identity primary key,
  cuenta_id            bigint not null references public.cuentas(id),
  fecha                date not null,
  orden                bigint not null,               -- desempate dentro del mismo día
  descripcion          text not null default '',     -- texto del banco / movimiento
  cargo                numeric(14,2) not null default 0 check (cargo >= 0),
  abono                numeric(14,2) not null default 0 check (abono >= 0),
  tipo_cambio          numeric(14,6) not null default 1 check (tipo_cambio > 0),
  concepto_id          bigint references public.conceptos(id),
  proveedor_id         bigint references public.proveedores(id),
  referencia           text,                          -- cheque / referencia / folio
  leyenda1             text,
  leyenda2             text,
  leyenda3             text,
  observaciones        text,
  transferencia_id     uuid,                          -- une los dos lados de una transferencia
  es_ajuste            boolean not null default false,
  aviso_whatsapp       text check (aviso_whatsapp in ('pendiente','enviado')),
  aviso_correo         text check (aviso_correo in ('pendiente','enviado')),
  legacy_programado_id integer,                       -- pago programado del sistema anterior
  legacy_cuenta_id     integer,
  legacy_id            integer,
  creado_por           uuid default auth.uid() references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (legacy_cuenta_id, legacy_id)
);
comment on table public.transacciones is 'Movimientos de cada cuenta (cargos y abonos). El saldo se calcula en v_transacciones.';

create index transacciones_cuenta_fecha_idx on public.transacciones (cuenta_id, fecha, orden, id);
create index transacciones_fecha_idx on public.transacciones (fecha);
create index transacciones_concepto_idx on public.transacciones (concepto_id);
create index transacciones_proveedor_idx on public.transacciones (proveedor_id);
create index transacciones_transferencia_idx on public.transacciones (transferencia_id) where transferencia_id is not null;
create index transacciones_creado_por_idx on public.transacciones (creado_por);

create table public.transaccion_clasificaciones (
  transaccion_id    bigint not null references public.transacciones(id) on delete cascade,
  clasificacion_id  bigint not null references public.clasificaciones(id),
  primary key (transaccion_id, clasificacion_id)
);
create index transaccion_clasif_clasif_idx on public.transaccion_clasificaciones (clasificacion_id);

-- Orden automático: el nuevo movimiento queda al final de la cuenta.
create or replace function public.tg_transaccion_orden()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.orden is null then
    select coalesce(max(orden), 0) + 1 into new.orden from public.transacciones where cuenta_id = new.cuenta_id;
  end if;
  return new;
end $$;
create trigger transacciones_orden before insert on public.transacciones
  for each row execute function public.tg_transaccion_orden();
create trigger transacciones_updated before update on public.transacciones
  for each row execute function public.tg_set_updated_at();
revoke execute on function public.tg_transaccion_orden() from public, anon, authenticated;

-- Permisos: titular modifica; titular y contador consultan.
alter table public.transacciones enable row level security;
alter table public.transaccion_clasificaciones enable row level security;
do $$
declare t text;
begin
  foreach t in array array['transacciones','transaccion_clasificaciones'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select privado.puede_consultar()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select privado.es_titular()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select privado.es_titular())) with check ((select privado.es_titular()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select privado.es_titular()))', t||'_delete', t);
  end loop;
end $$;

-- ---------- Vistas con saldo -------------------------------------------------
-- security_invoker: las vistas respetan los permisos (RLS) de quien consulta.
create view public.v_transacciones with (security_invoker = true) as
select
  t.*,
  c.saldo_inicial
    + sum(t.abono - t.cargo) over (partition by t.cuenta_id order by t.fecha, t.orden, t.id
                                   rows between unbounded preceding and current row) as saldo,
  co.nombre as concepto,
  coalesce(nullif(p.razon_social, ''), concat_ws(' ', p.nombre, p.apellido_paterno, p.apellido_materno)) as proveedor,
  (select coalesce(array_agg(tc.clasificacion_id order by tc.clasificacion_id), '{}')
     from public.transaccion_clasificaciones tc where tc.transaccion_id = t.id) as clasificaciones
from public.transacciones t
join public.cuentas c on c.id = t.cuenta_id
left join public.conceptos co on co.id = t.concepto_id
left join public.proveedores p on p.id = t.proveedor_id;

create view public.v_saldos_cuentas with (security_invoker = true) as
select
  c.id as cuenta_id,
  c.nombre,
  c.activa,
  m.codigo as moneda,
  tc.nombre as tipo_cuenta,
  tc.naturaleza,
  b.nombre as banco,
  c.saldo_inicial,
  c.saldo_inicial + coalesce(sum(t.abono - t.cargo), 0) as saldo,
  count(t.id) as movimientos,
  max(t.fecha) as ultimo_movimiento
from public.cuentas c
join public.monedas m on m.id = c.moneda_id
left join public.tipos_cuenta tc on tc.id = c.tipo_cuenta_id
left join public.bancos b on b.id = c.banco_id
left join public.transacciones t on t.cuenta_id = c.id
group by c.id, m.codigo, tc.nombre, tc.naturaleza, b.nombre;

grant select on public.v_transacciones, public.v_saldos_cuentas to authenticated;
revoke all on public.v_transacciones, public.v_saldos_cuentas from anon;

-- ---------- Transferencia entre cuentas (los dos lados, en un solo paso) ------
create or replace function public.crear_transferencia(
  p_origen bigint, p_destino bigint, p_fecha date, p_monto numeric,
  p_monto_destino numeric default null, p_descripcion text default 'TRANSFERENCIA',
  p_concepto_id bigint default null, p_observaciones text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid := gen_random_uuid();
begin
  if not (select privado.es_titular()) then raise exception 'Solo el titular puede registrar movimientos'; end if;
  if p_origen = p_destino then raise exception 'La cuenta de origen y destino deben ser distintas'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  insert into public.transacciones (cuenta_id, fecha, descripcion, cargo, concepto_id, observaciones, transferencia_id)
    values (p_origen, p_fecha, p_descripcion, p_monto, p_concepto_id, p_observaciones, v_id);
  insert into public.transacciones (cuenta_id, fecha, descripcion, abono, concepto_id, observaciones, transferencia_id)
    values (p_destino, p_fecha, p_descripcion, coalesce(p_monto_destino, p_monto), p_concepto_id, p_observaciones, v_id);
  return v_id;
end $$;
revoke execute on function public.crear_transferencia(bigint, bigint, date, numeric, numeric, text, bigint, text) from public, anon;
grant execute on function public.crear_transferencia(bigint, bigint, date, numeric, numeric, text, bigint, text) to authenticated;

-- ---------- Búsqueda de movimientos con filtros, totales y paginación --------
create extension if not exists unaccent with schema extensions;

create or replace function public.buscar_transacciones(
  p_cuenta bigint,
  p_desde date default null,
  p_hasta date default null,
  p_texto text default null,
  p_concepto bigint default null,
  p_proveedor bigint default null,
  p_clasificacion bigint default null,
  p_tipo text default null,          -- 'cargos' | 'abonos' | null
  p_limite int default 50,
  p_offset int default 0
) returns table (
  id bigint, cuenta_id bigint, fecha date, orden bigint, descripcion text,
  cargo numeric, abono numeric, saldo numeric, tipo_cambio numeric,
  concepto_id bigint, concepto text, proveedor_id bigint, proveedor text,
  referencia text, leyenda1 text, leyenda2 text, leyenda3 text, observaciones text,
  transferencia_id uuid, es_ajuste boolean, aviso_whatsapp text, aviso_correo text,
  clasificaciones bigint[], total bigint, total_cargos numeric, total_abonos numeric
)
language sql stable security invoker set search_path = public, extensions as $$
  with f as (
    select v.* from public.v_transacciones v
    where v.cuenta_id = p_cuenta
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
      and (p_concepto is null or v.concepto_id = p_concepto)
      and (p_proveedor is null or v.proveedor_id = p_proveedor)
      and (p_clasificacion is null or v.clasificaciones @> array[p_clasificacion])
      and (p_tipo is null or (p_tipo = 'cargos' and v.cargo > 0) or (p_tipo = 'abonos' and v.abono > 0))
      and (coalesce(p_texto, '') = '' or unaccent(lower(concat_ws(' ',
            v.descripcion, v.referencia, v.leyenda1, v.leyenda2, v.leyenda3, v.observaciones,
            v.concepto, v.proveedor, v.cargo::text, v.abono::text)))
          like '%' || unaccent(lower(p_texto)) || '%')
  )
  select f.id, f.cuenta_id, f.fecha, f.orden, f.descripcion, f.cargo, f.abono, f.saldo, f.tipo_cambio,
         f.concepto_id, f.concepto, f.proveedor_id, f.proveedor, f.referencia, f.leyenda1, f.leyenda2,
         f.leyenda3, f.observaciones, f.transferencia_id, f.es_ajuste, f.aviso_whatsapp, f.aviso_correo,
         f.clasificaciones,
         count(*) over (), coalesce(sum(f.cargo) over (), 0), coalesce(sum(f.abono) over (), 0)
  from f
  order by f.fecha desc, f.orden desc, f.id desc
  limit greatest(least(p_limite, 5000), 1) offset greatest(p_offset, 0)
$$;
revoke execute on function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) from public, anon;
grant execute on function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) to authenticated;
