-- =============================================================================
-- Smart Account 2 · Fase 3a: pagos programados (registro de pagos por vencer)
--  · pagos_programados: el plan (a quién, cuánto, cada cuándo, de qué cuenta).
--  · vencimientos: cada fecha a pagar, con estado pendiente / pagado / omitido.
--    Al pagar se registra un movimiento normal y queda ligado al vencimiento.
--  · Los avisos por WhatsApp y correo (fase 3b) usarán avisar_whatsapp / avisar_correo.
-- =============================================================================

create table public.pagos_programados (
  id              bigint generated always as identity primary key,
  cuenta_id       bigint references public.cuentas(id) on delete set null,   -- cuenta sugerida para pagar
  proveedor_id    bigint references public.proveedores(id),
  concepto_id     bigint references public.conceptos(id),
  descripcion     text not null default '',                                   -- "Transacción"
  cargo           numeric(14,2) not null default 0 check (cargo >= 0),
  abono           numeric(14,2) not null default 0 check (abono >= 0),
  referencia      text,
  leyenda1        text,
  leyenda2        text,
  leyenda3        text,
  observaciones   text,
  frecuencia      text not null check (frecuencia in
                    ('unica','semanal','quincenal','mensual','bimestral','trimestral','cuatrimestral','semestral','anual')),
  dias_mes        smallint[] not null default '{}',   -- días del mes (quincenal usa dos)
  dia_semana      smallint check (dia_semana between 1 and 7),               -- 1 = lunes … 7 = domingo
  fecha_inicio    date not null,
  fecha_fin       date,
  generar_desde   date,                                -- no crear vencimientos antes de esta fecha
  generado_hasta  date,                                -- hasta dónde ya se crearon vencimientos
  activo          boolean not null default true,
  avisar_whatsapp boolean not null default false,
  avisar_correo   boolean not null default false,
  legacy_id       integer unique,
  creado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  check (frecuencia in ('unica','semanal') or cardinality(dias_mes) between 1 and 2)
);
comment on table public.pagos_programados is 'Pagos que se repiten (renta, colegiaturas, seguros…). Cada fecha a pagar vive en vencimientos.';
create index pagos_programados_cuenta_idx on public.pagos_programados (cuenta_id);
create index pagos_programados_proveedor_idx on public.pagos_programados (proveedor_id);
create index pagos_programados_concepto_idx on public.pagos_programados (concepto_id);
create index pagos_programados_creado_por_idx on public.pagos_programados (creado_por);
create trigger pagos_programados_updated before update on public.pagos_programados
  for each row execute function public.tg_set_updated_at();

create table public.pago_programado_clasificaciones (
  pago_id          bigint not null references public.pagos_programados(id) on delete cascade,
  clasificacion_id bigint not null references public.clasificaciones(id),
  primary key (pago_id, clasificacion_id)
);
create index pago_prog_clasif_clasif_idx on public.pago_programado_clasificaciones (clasificacion_id);

create table public.vencimientos (
  id              bigint generated always as identity primary key,
  pago_id         bigint not null references public.pagos_programados(id) on delete cascade,
  fecha           date not null,
  importe         numeric(14,2) check (importe >= 0),   -- si se cambió solo para esta fecha
  estado          text not null default 'pendiente' check (estado in ('pendiente','pagado','omitido')),
  transaccion_id  bigint references public.transacciones(id) on delete set null,
  notas           text,
  pagado_en       timestamptz,
  legacy_id       integer unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (pago_id, fecha)
);
comment on table public.vencimientos is 'Cada fecha en que toca pagar un pago programado';
create index vencimientos_fecha_idx on public.vencimientos (fecha) where estado = 'pendiente';
create index vencimientos_transaccion_idx on public.vencimientos (transaccion_id) where transaccion_id is not null;
create trigger vencimientos_updated before update on public.vencimientos
  for each row execute function public.tg_set_updated_at();

-- Si se borra el movimiento con el que se pagó, el vencimiento vuelve a quedar pendiente.
create or replace function public.tg_vencimiento_sin_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.vencimientos set estado = 'pendiente', pagado_en = null, transaccion_id = null
  where transaccion_id = old.id;
  return old;
end $$;
revoke all on function public.tg_vencimiento_sin_pago() from public, anon, authenticated;
create trigger transacciones_libera_vencimiento before delete on public.transacciones
  for each row execute function public.tg_vencimiento_sin_pago();

-- ---------- Permisos ---------------------------------------------------------
-- El titular administra todo. Un usuario ve los pagos de sus cuentas y puede
-- marcarlos como pagados si puede capturar en esa cuenta.
alter table public.pagos_programados enable row level security;
alter table public.pago_programado_clasificaciones enable row level security;
alter table public.vencimientos enable row level security;

create policy pagos_programados_select on public.pagos_programados for select to authenticated
  using ((select privado.es_titular()) or (select privado.cuentas_visibles()) @> array[cuenta_id]);
create policy pagos_programados_insert on public.pagos_programados for insert to authenticated with check ((select privado.es_titular()));
create policy pagos_programados_update on public.pagos_programados for update to authenticated
  using ((select privado.es_titular())) with check ((select privado.es_titular()));
create policy pagos_programados_delete on public.pagos_programados for delete to authenticated using ((select privado.es_titular()));

create policy pago_prog_clasif_select on public.pago_programado_clasificaciones for select to authenticated
  using (exists (select 1 from public.pagos_programados p where p.id = pago_id));
create policy pago_prog_clasif_insert on public.pago_programado_clasificaciones for insert to authenticated with check ((select privado.es_titular()));
create policy pago_prog_clasif_delete on public.pago_programado_clasificaciones for delete to authenticated using ((select privado.es_titular()));

create policy vencimientos_select on public.vencimientos for select to authenticated
  using (exists (select 1 from public.pagos_programados p where p.id = pago_id));
create policy vencimientos_insert on public.vencimientos for insert to authenticated with check ((select privado.es_titular()));
create policy vencimientos_update on public.vencimientos for update to authenticated
  using ((select privado.es_titular()) or exists (select 1 from public.pagos_programados p where p.id = pago_id
         and (select privado.cuentas_editables()) @> array[p.cuenta_id]))
  with check ((select privado.es_titular()) or exists (select 1 from public.pagos_programados p where p.id = pago_id
         and (select privado.cuentas_editables()) @> array[p.cuenta_id]));
create policy vencimientos_delete on public.vencimientos for delete to authenticated using ((select privado.es_titular()));

-- ---------- Calendario: fechas que le tocan a un plan --------------------------
create or replace function public.fechas_pago(
  p_frecuencia text, p_dias_mes smallint[], p_dia_semana smallint,
  p_inicio date, p_fin date, p_desde date, p_hasta date)
returns setof date language sql immutable set search_path = public as $$
  with lim as (
    select greatest(p_inicio, coalesce(p_desde, p_inicio)) as desde,
           least(coalesce(p_fin, p_hasta), p_hasta) as hasta,
           case p_frecuencia when 'quincenal' then 1 when 'mensual' then 1 when 'bimestral' then 2
             when 'trimestral' then 3 when 'cuatrimestral' then 4 when 'semestral' then 6 when 'anual' then 12 end as paso
  ),
  todas as (
    -- Única
    select p_inicio as f from lim where p_frecuencia = 'unica'
    union all
    -- Semanal: cada 7 días a partir del primer día de la semana elegido
    select g::date from lim,
      generate_series(p_inicio + ((coalesce(p_dia_semana, extract(isodow from p_inicio)::smallint) - extract(isodow from p_inicio)::int + 7) % 7),
                      lim.hasta, interval '7 days') g
    where p_frecuencia = 'semanal'
    union all
    -- Por meses: cada N meses contados desde el mes de inicio; si el mes es corto, el último día.
    select (m + (least(d, extract(day from (m + interval '1 month - 1 day'))::int) - 1) * interval '1 day')::date
    from lim,
      generate_series(date_trunc('month', p_inicio), lim.hasta, make_interval(months => lim.paso)) m,
      unnest(p_dias_mes) d
    where lim.paso is not null
  )
  select distinct f from todas, lim where f between lim.desde and lim.hasta order by 1
$$;

-- Crea los vencimientos que falten hasta el horizonte (idempotente).
create or replace function public.generar_vencimientos(p_pago bigint default null, p_hasta date default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_hasta date := coalesce(p_hasta, (current_date + interval '18 months')::date); v_n integer := 0; v_r integer; p record;
begin
  if not privado.es_titular() then return 0; end if;
  for p in
    select * from pagos_programados
    where activo and (p_pago is null or id = p_pago)
      and (generado_hasta is null or generado_hasta < least(coalesce(fecha_fin, v_hasta), v_hasta))
  loop
    insert into vencimientos (pago_id, fecha)
    select p.id, f from fechas_pago(p.frecuencia, p.dias_mes, p.dia_semana, p.fecha_inicio, p.fecha_fin,
                                     greatest(p.generar_desde, p.generado_hasta + 1), v_hasta) f
    on conflict (pago_id, fecha) do nothing;
    get diagnostics v_r = row_count;
    v_n := v_n + v_r;
    update pagos_programados set generado_hasta = least(coalesce(fecha_fin, v_hasta), v_hasta) where id = p.id;
  end loop;
  return v_n;
end $$;

-- Tras editar un plan: borra sus fechas pendientes desde hoy y las vuelve a crear.
create or replace function public.regenerar_vencimientos(p_pago bigint, p_desde date default current_date)
returns integer language plpgsql security invoker set search_path = public as $$
begin
  if not privado.es_titular() then raise exception 'Solo el titular puede cambiar pagos programados'; end if;
  delete from vencimientos where pago_id = p_pago and estado = 'pendiente' and fecha >= p_desde and importe is null and notas is null;
  update pagos_programados set generado_hasta = p_desde - 1,
    generar_desde = greatest(coalesce(generar_desde, p_desde), p_desde) where id = p_pago;
  return generar_vencimientos(p_pago);
end $$;

revoke execute on function public.fechas_pago(text, smallint[], smallint, date, date, date, date),
  public.generar_vencimientos(bigint, date), public.regenerar_vencimientos(bigint, date) from public, anon;
grant execute on function public.fechas_pago(text, smallint[], smallint, date, date, date, date),
  public.generar_vencimientos(bigint, date), public.regenerar_vencimientos(bigint, date) to authenticated;

-- ---------- Vista para las pantallas ----------------------------------------
create or replace view public.v_vencimientos with (security_invoker = true) as
select v.id, v.pago_id, v.fecha, v.estado, v.notas, v.transaccion_id, v.pagado_en,
       coalesce(v.importe, greatest(p.cargo, p.abono)) as importe,
       v.importe is not null as importe_cambiado,
       case when p.abono > p.cargo then 'abono' else 'cargo' end as tipo,
       p.cuenta_id, c.nombre as cuenta, coalesce(mo.codigo, 'MXN') as moneda,
       p.proveedor_id, coalesce(nullif(pr.razon_social, ''), concat_ws(' ', pr.nombre, pr.apellido_paterno, pr.apellido_materno)) as proveedor, p.concepto_id, co.nombre as concepto,
       p.descripcion, p.frecuencia, p.activo, p.avisar_whatsapp, p.avisar_correo,
       t.folio, t.cuenta_id as cuenta_pago_id, tc.nombre as cuenta_pago
from public.vencimientos v
join public.pagos_programados p on p.id = v.pago_id
left join public.cuentas c on c.id = p.cuenta_id
left join public.monedas mo on mo.id = c.moneda_id
left join public.proveedores pr on pr.id = p.proveedor_id
left join public.conceptos co on co.id = p.concepto_id
left join public.transacciones t on t.id = v.transaccion_id
left join public.cuentas tc on tc.id = t.cuenta_id;
revoke all on public.v_vencimientos from anon;
grant select on public.v_vencimientos to authenticated;

-- ---------- Fusiones y conteos: incluir pagos programados -----------------------
create or replace function public.conteo_usos(p_catalogo text)
returns table (id bigint, usos bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_catalogo = 'proveedores' then
    return query select t.proveedor_id, count(*) from public.transacciones t where t.proveedor_id is not null group by 1;
  elsif p_catalogo = 'conceptos' then
    return query select t.concepto_id, count(*) from public.transacciones t where t.concepto_id is not null group by 1;
  elsif p_catalogo = 'clasificaciones' then
    return query select tc.clasificacion_id, count(*) from public.transaccion_clasificaciones tc group by 1;
  end if;
end $$;

create or replace function public.fusionar_catalogo(p_catalogo text, p_conservar bigint, p_eliminar bigint[])
returns integer
language plpgsql security invoker set search_path = public as $$
declare v_mov integer := 0; v_copia jsonb; v_ids bigint[];
begin
  if not privado.es_titular() then raise exception 'Solo el titular puede fusionar registros'; end if;
  v_ids := array(select x from unnest(p_eliminar) x where x is not null and x <> p_conservar);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Elige al menos un registro para fusionar'; end if;

  if p_catalogo = 'proveedores' then
    if not exists (select 1 from proveedores where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(p)) into v_copia from proveedores p where p.id = any (v_ids);
    update proveedores k set
      rfc = coalesce(k.rfc, d.rfc), correo = coalesce(k.correo, d.correo),
      celular = coalesce(k.celular, d.celular), telefono = coalesce(k.telefono, d.telefono),
      razon_social = coalesce(k.razon_social, d.razon_social)
    from (select (array_agg(rfc) filter (where rfc is not null))[1] rfc,
                 (array_agg(correo) filter (where correo is not null))[1] correo,
                 (array_agg(celular) filter (where celular is not null))[1] celular,
                 (array_agg(telefono) filter (where telefono is not null))[1] telefono,
                 (array_agg(razon_social) filter (where razon_social is not null))[1] razon_social
          from proveedores where id = any (v_ids)) d
    where k.id = p_conservar;
    update transacciones set proveedor_id = p_conservar where proveedor_id = any (v_ids);
    get diagnostics v_mov = row_count;
    update pagos_programados set proveedor_id = p_conservar where proveedor_id = any (v_ids);
    delete from proveedores where id = any (v_ids);

  elsif p_catalogo = 'conceptos' then
    if not exists (select 1 from conceptos where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(c)) into v_copia from conceptos c where c.id = any (v_ids);
    update transacciones set concepto_id = p_conservar where concepto_id = any (v_ids);
    get diagnostics v_mov = row_count;
    update pagos_programados set concepto_id = p_conservar where concepto_id = any (v_ids);
    delete from conceptos where id = any (v_ids);

  elsif p_catalogo = 'clasificaciones' then
    if not exists (select 1 from clasificaciones where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(c)) into v_copia from clasificaciones c where c.id = any (v_ids);
    insert into transaccion_clasificaciones (transaccion_id, clasificacion_id)
      select distinct transaccion_id, p_conservar from transaccion_clasificaciones where clasificacion_id = any (v_ids)
      on conflict do nothing;
    get diagnostics v_mov = row_count;
    delete from transaccion_clasificaciones where clasificacion_id = any (v_ids);
    insert into pago_programado_clasificaciones (pago_id, clasificacion_id)
      select distinct pago_id, p_conservar from pago_programado_clasificaciones where clasificacion_id = any (v_ids)
      on conflict do nothing;
    delete from pago_programado_clasificaciones where clasificacion_id = any (v_ids);
    delete from clasificaciones where id = any (v_ids);
  else
    raise exception 'Catálogo no válido';
  end if;

  insert into fusiones (catalogo, conservado_id, eliminados, movimientos) values (p_catalogo, p_conservar, v_copia, v_mov);
  return v_mov;
end $$;

create or replace function public.eliminar_clasificacion(p_id bigint)
returns integer
language plpgsql security invoker set search_path = public as $$
declare v_mov integer; v_copia jsonb;
begin
  if not privado.es_titular() then raise exception 'Solo el titular puede eliminar clasificaciones'; end if;
  select jsonb_agg(to_jsonb(c)) into v_copia from clasificaciones c where c.id = p_id;
  if v_copia is null then raise exception 'Registro no encontrado'; end if;
  delete from transaccion_clasificaciones where clasificacion_id = p_id;
  get diagnostics v_mov = row_count;
  delete from pago_programado_clasificaciones where clasificacion_id = p_id;
  delete from clasificaciones where id = p_id;
  insert into fusiones (catalogo, conservado_id, eliminados, movimientos) values ('clasificaciones (eliminada)', 0, v_copia, v_mov);
  return v_mov;
end $$;
