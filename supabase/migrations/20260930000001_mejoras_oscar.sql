-- =============================================================================
-- Smart Account 2 · Mejoras solicitadas por Oscar (30-sep-2026)
--  1. Folio: insertar en medio (desplaza los siguientes), mover y cerrar huecos.
--     El saldo y el orden de la lista siguen el folio.
--  2. Documentos adjuntos por movimiento (Storage privado).
--  3-4. Búsqueda en una, varias o todas las cuentas, con totales por moneda.
--  5. Usuarios con permisos por cuenta (ver / editar).
--  6-7. Fusionar proveedores, conceptos y clasificaciones; eliminar clasificación.
-- =============================================================================

-- ---------- 5. Roles y permisos por cuenta ---------------------------------
alter table public.perfiles drop constraint perfiles_rol_check;
update public.perfiles set rol = 'usuario' where rol = 'contador';
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('titular','usuario','pendiente'));

create table public.permisos_cuenta (
  usuario_id  uuid   not null references public.perfiles(id) on delete cascade,
  cuenta_id   bigint not null references public.cuentas(id) on delete cascade,
  nivel       text   not null check (nivel in ('ver','editar')),
  primary key (usuario_id, cuenta_id)
);
create index permisos_cuenta_cuenta_idx on public.permisos_cuenta (cuenta_id);
comment on table public.permisos_cuenta is 'Cuentas que puede ver (o editar) cada usuario que no es titular';

create or replace function privado.puede_consultar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('titular','usuario') from public.perfiles where id = auth.uid()), false)
$$;

-- Cuentas visibles / editables del usuario actual (arreglos: se evalúan una sola vez por consulta)
create or replace function privado.cuentas_visibles()
returns bigint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pc.cuenta_id), '{}')
  from public.permisos_cuenta pc join public.perfiles p on p.id = pc.usuario_id and p.rol = 'usuario'
  where pc.usuario_id = auth.uid()
$$;
create or replace function privado.cuentas_editables()
returns bigint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pc.cuenta_id), '{}')
  from public.permisos_cuenta pc join public.perfiles p on p.id = pc.usuario_id and p.rol = 'usuario'
  where pc.usuario_id = auth.uid() and pc.nivel = 'editar'
$$;
revoke all on function privado.cuentas_visibles(), privado.cuentas_editables() from public, anon;
grant execute on function privado.cuentas_visibles(), privado.cuentas_editables() to authenticated;

alter table public.permisos_cuenta enable row level security;
create policy permisos_select on public.permisos_cuenta for select to authenticated
  using (usuario_id = (select auth.uid()) or (select privado.es_titular()));
create policy permisos_insert on public.permisos_cuenta for insert to authenticated with check ((select privado.es_titular()));
create policy permisos_update on public.permisos_cuenta for update to authenticated
  using ((select privado.es_titular())) with check ((select privado.es_titular()));
create policy permisos_delete on public.permisos_cuenta for delete to authenticated using ((select privado.es_titular()));

-- Cuentas: el titular ve todas; los usuarios, solo las asignadas.
drop policy cuentas_select on public.cuentas;
create policy cuentas_select on public.cuentas for select to authenticated
  using ((select privado.es_titular()) or (select privado.cuentas_visibles()) @> array[id]);

-- Movimientos
drop policy transacciones_select on public.transacciones;
drop policy transacciones_insert on public.transacciones;
drop policy transacciones_update on public.transacciones;
drop policy transacciones_delete on public.transacciones;
create policy transacciones_select on public.transacciones for select to authenticated
  using ((select privado.es_titular()) or (select privado.cuentas_visibles()) @> array[cuenta_id]);
create policy transacciones_insert on public.transacciones for insert to authenticated
  with check ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[cuenta_id]);
create policy transacciones_update on public.transacciones for update to authenticated
  using ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[cuenta_id])
  with check ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[cuenta_id]);
create policy transacciones_delete on public.transacciones for delete to authenticated
  using ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[cuenta_id]);

drop policy transaccion_clasificaciones_select on public.transaccion_clasificaciones;
drop policy transaccion_clasificaciones_insert on public.transaccion_clasificaciones;
drop policy transaccion_clasificaciones_update on public.transaccion_clasificaciones;
drop policy transaccion_clasificaciones_delete on public.transaccion_clasificaciones;
create policy transaccion_clasificaciones_select on public.transaccion_clasificaciones for select to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id));
create policy transaccion_clasificaciones_insert on public.transaccion_clasificaciones for insert to authenticated
  with check (exists (select 1 from public.transacciones t where t.id = transaccion_id
              and ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[t.cuenta_id])));
create policy transaccion_clasificaciones_delete on public.transaccion_clasificaciones for delete to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id
         and ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[t.cuenta_id])));

-- ---------- 1. Folio: insertar en medio, mover y cerrar huecos ---------------
create or replace function public.tg_transaccion_orden()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.orden is null then
    select coalesce(max(orden), 0) + 1 into new.orden from public.transacciones where cuenta_id = new.cuenta_id;
  end if;
  if new.folio is null then
    select coalesce(max(folio), 0) + 1 into new.folio from public.transacciones where cuenta_id = new.cuenta_id;
  elsif pg_trigger_depth() = 1 then
    -- Se inserta en un folio ya ocupado: los siguientes se recorren un lugar.
    update public.transacciones set folio = folio + 1 where cuenta_id = new.cuenta_id and folio >= new.folio;
  end if;
  return new;
end $$;

create or replace function public.tg_transaccion_mover_folio()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.folio = old.folio or new.cuenta_id <> old.cuenta_id then
    return new;
  end if;
  if new.folio < old.folio then
    update public.transacciones set folio = folio + 1
      where cuenta_id = new.cuenta_id and id <> new.id and folio >= new.folio and folio < old.folio;
  else
    update public.transacciones set folio = folio - 1
      where cuenta_id = new.cuenta_id and id <> new.id and folio > old.folio and folio <= new.folio;
  end if;
  return new;
end $$;
create trigger transacciones_mover_folio before update of folio on public.transacciones
  for each row execute function public.tg_transaccion_mover_folio();

create or replace function public.tg_transaccion_cerrar_folio()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() = 1 then
    update public.transacciones set folio = folio - 1 where cuenta_id = old.cuenta_id and folio > old.folio;
  end if;
  return old;
end $$;
create trigger transacciones_cerrar_folio after delete on public.transacciones
  for each row execute function public.tg_transaccion_cerrar_folio();
revoke execute on function public.tg_transaccion_orden(), public.tg_transaccion_mover_folio(),
  public.tg_transaccion_cerrar_folio() from public, anon, authenticated;

-- ---------- 2. Documentos adjuntos -----------------------------------------
create table public.documentos (
  id              bigint generated always as identity primary key,
  transaccion_id  bigint not null references public.transacciones(id) on delete cascade,
  nombre          text not null,
  ruta            text not null unique,        -- ruta en Storage: <cuenta>/<movimiento>/<archivo>
  tipo            text,
  tamano          bigint,
  legacy_id       integer unique,
  creado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index documentos_transaccion_idx on public.documentos (transaccion_id);
create index documentos_creado_por_idx on public.documentos (creado_por);
alter table public.documentos enable row level security;
create policy documentos_select on public.documentos for select to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id));
create policy documentos_insert on public.documentos for insert to authenticated
  with check (exists (select 1 from public.transacciones t where t.id = transaccion_id
              and ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[t.cuenta_id])));
create policy documentos_delete on public.documentos for delete to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id
         and ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[t.cuenta_id])));

insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 26214400)
on conflict (id) do nothing;

create policy documentos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and ((select privado.es_titular())
         or (select privado.cuentas_visibles()) @> array[((storage.foldername(name))[1])::bigint]));
create policy documentos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and ((select privado.es_titular())
         or (select privado.cuentas_editables()) @> array[((storage.foldername(name))[1])::bigint]));
create policy documentos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and ((select privado.es_titular())
         or (select privado.cuentas_editables()) @> array[((storage.foldername(name))[1])::bigint]));

-- Transferencias: la seguridad la dan los permisos de cada cuenta.
create or replace function public.crear_transferencia(
  p_origen bigint, p_destino bigint, p_fecha date, p_monto numeric,
  p_monto_destino numeric default null, p_descripcion text default 'TRANSFERENCIA',
  p_concepto_id bigint default null, p_observaciones text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid := gen_random_uuid();
begin
  if p_origen = p_destino then raise exception 'La cuenta de origen y destino deben ser distintas'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  insert into public.transacciones (cuenta_id, fecha, descripcion, cargo, concepto_id, observaciones, transferencia_id)
    values (p_origen, p_fecha, p_descripcion, p_monto, p_concepto_id, p_observaciones, v_id);
  insert into public.transacciones (cuenta_id, fecha, descripcion, abono, concepto_id, observaciones, transferencia_id)
    values (p_destino, p_fecha, p_descripcion, coalesce(p_monto_destino, p_monto), p_concepto_id, p_observaciones, v_id);
  return v_id;
end $$;

-- ---------- Vista con saldo en orden de folio -------------------------------
drop function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int);
drop view public.v_transacciones;
create view public.v_transacciones with (security_invoker = true) as
select
  t.*,
  c.saldo_inicial
    + sum(t.abono - t.cargo) over (partition by t.cuenta_id order by t.folio, t.orden, t.id
                                   rows between unbounded preceding and current row) as saldo,
  c.nombre as cuenta,
  m.codigo as moneda,
  co.nombre as concepto,
  coalesce(nullif(p.razon_social, ''), concat_ws(' ', p.nombre, p.apellido_paterno, p.apellido_materno)) as proveedor,
  (select coalesce(array_agg(tc.clasificacion_id order by tc.clasificacion_id), '{}')
     from public.transaccion_clasificaciones tc where tc.transaccion_id = t.id) as clasificaciones,
  (select count(*) from public.documentos d where d.transaccion_id = t.id)::int as documentos
from public.transacciones t
join public.cuentas c on c.id = t.cuenta_id
join public.monedas m on m.id = c.moneda_id
left join public.conceptos co on co.id = t.concepto_id
left join public.proveedores p on p.id = t.proveedor_id;
grant select on public.v_transacciones to authenticated;
revoke all on public.v_transacciones from anon;

-- ---------- 3-4. Búsqueda en una, varias o todas las cuentas -----------------
create or replace function public.filtrar_movimientos(
  p_cuentas bigint[] default null,     -- null = todas las cuentas que el usuario puede ver
  p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null             -- 'cargos' | 'abonos' | null
) returns setof public.v_transacciones
language sql stable security invoker set search_path = public, extensions as $$
  select v.* from public.v_transacciones v
  where (p_cuentas is null or v.cuenta_id = any (p_cuentas))
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
    and (p_concepto is null or v.concepto_id = p_concepto)
    and (p_proveedor is null or v.proveedor_id = p_proveedor)
    and (p_clasificacion is null or v.clasificaciones @> array[p_clasificacion])
    and (p_tipo is null or (p_tipo = 'cargos' and v.cargo > 0) or (p_tipo = 'abonos' and v.abono > 0))
    and (coalesce(p_texto, '') = '' or unaccent(lower(concat_ws(' ',
          v.folio::text, v.descripcion, v.referencia, v.leyenda1, v.leyenda2, v.leyenda3, v.observaciones,
          v.concepto, v.proveedor, v.cargo::text, v.abono::text)))
        like '%' || unaccent(lower(p_texto)) || '%')
$$;

create or replace function public.buscar_movimientos(
  p_cuentas bigint[] default null,
  p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null,
  p_orden text default 'folio',        -- 'folio' (una cuenta) | 'fecha' (varias cuentas)
  p_limite int default 50, p_offset int default 0
) returns table (
  id bigint, cuenta_id bigint, cuenta text, moneda text, folio integer, fecha date, descripcion text,
  cargo numeric, abono numeric, saldo numeric, tipo_cambio numeric,
  concepto_id bigint, concepto text, proveedor_id bigint, proveedor text,
  referencia text, leyenda1 text, leyenda2 text, leyenda3 text, observaciones text,
  transferencia_id uuid, es_ajuste boolean, aviso_whatsapp text, aviso_correo text,
  clasificaciones bigint[], documentos int, total bigint
)
language sql stable security invoker set search_path = public as $$
  select f.id, f.cuenta_id, f.cuenta, f.moneda, f.folio, f.fecha, f.descripcion, f.cargo, f.abono, f.saldo,
         f.tipo_cambio, f.concepto_id, f.concepto, f.proveedor_id, f.proveedor, f.referencia, f.leyenda1,
         f.leyenda2, f.leyenda3, f.observaciones, f.transferencia_id, f.es_ajuste, f.aviso_whatsapp,
         f.aviso_correo, f.clasificaciones, f.documentos, count(*) over ()
  from public.filtrar_movimientos(p_cuentas, p_desde, p_hasta, p_texto, p_concepto, p_proveedor, p_clasificacion, p_tipo) f
  order by
    case when p_orden = 'fecha' then f.fecha end desc,
    case when p_orden = 'fecha' then f.cuenta end,
    f.folio desc, f.orden desc, f.id desc
  limit greatest(least(p_limite, 5000), 1) offset greatest(p_offset, 0)
$$;

create or replace function public.totales_movimientos(
  p_cuentas bigint[] default null,
  p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null
) returns table (moneda text, movimientos bigint, cargos numeric, abonos numeric)
language sql stable security invoker set search_path = public as $$
  select f.moneda, count(*), coalesce(sum(f.cargo), 0), coalesce(sum(f.abono), 0)
  from public.filtrar_movimientos(p_cuentas, p_desde, p_hasta, p_texto, p_concepto, p_proveedor, p_clasificacion, p_tipo) f
  group by f.moneda order by f.moneda
$$;

-- Compatibilidad con la versión anterior de la pantalla (mientras se publica el código nuevo)
create or replace function public.buscar_transacciones(
  p_cuenta bigint, p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null, p_limite int default 50, p_offset int default 0
) returns table (
  id bigint, cuenta_id bigint, folio integer, fecha date, orden bigint, descripcion text,
  cargo numeric, abono numeric, saldo numeric, tipo_cambio numeric,
  concepto_id bigint, concepto text, proveedor_id bigint, proveedor text,
  referencia text, leyenda1 text, leyenda2 text, leyenda3 text, observaciones text,
  transferencia_id uuid, es_ajuste boolean, aviso_whatsapp text, aviso_correo text,
  clasificaciones bigint[], total bigint, total_cargos numeric, total_abonos numeric
)
language sql stable security invoker set search_path = public as $$
  select f.id, f.cuenta_id, f.folio, f.fecha, f.orden, f.descripcion, f.cargo, f.abono, f.saldo, f.tipo_cambio,
         f.concepto_id, f.concepto, f.proveedor_id, f.proveedor, f.referencia, f.leyenda1, f.leyenda2,
         f.leyenda3, f.observaciones, f.transferencia_id, f.es_ajuste, f.aviso_whatsapp, f.aviso_correo,
         f.clasificaciones, count(*) over (), coalesce(sum(f.cargo) over (), 0), coalesce(sum(f.abono) over (), 0)
  from public.filtrar_movimientos(array[p_cuenta], p_desde, p_hasta, p_texto, p_concepto, p_proveedor, p_clasificacion, p_tipo) f
  order by f.folio desc, f.orden desc, f.id desc
  limit greatest(least(p_limite, 5000), 1) offset greatest(p_offset, 0)
$$;

revoke execute on function public.filtrar_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text),
  public.buscar_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text, text, int, int),
  public.totales_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text),
  public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) from public, anon;
grant execute on function public.filtrar_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text),
  public.buscar_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text, text, int, int),
  public.totales_movimientos(bigint[], date, date, text, bigint, bigint, bigint, text),
  public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) to authenticated;

-- ---------- 6-7. Fusionar y eliminar registros de catálogos ----------------
create table public.fusiones (
  id               bigint generated always as identity primary key,
  catalogo         text not null,
  conservado_id    bigint not null,
  eliminados       jsonb not null,          -- copia completa de los registros que desaparecieron
  movimientos      integer not null default 0,
  usuario_id       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index fusiones_usuario_idx on public.fusiones (usuario_id);
alter table public.fusiones enable row level security;
create policy fusiones_select on public.fusiones for select to authenticated using ((select privado.es_titular()));

-- Cuántos movimientos usa cada registro del catálogo
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

-- Fusiona varios registros en uno: todos los movimientos pasan al que se conserva.
-- (Cuando existan pagos programados, también se deben mover aquí.)
create or replace function public.fusionar_catalogo(p_catalogo text, p_conservar bigint, p_eliminar bigint[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_mov integer := 0; v_copia jsonb; v_ids bigint[];
begin
  if not privado.es_titular() then raise exception 'Solo el titular puede fusionar registros'; end if;
  v_ids := array(select x from unnest(p_eliminar) x where x is not null and x <> p_conservar);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Elige al menos un registro para fusionar'; end if;

  if p_catalogo = 'proveedores' then
    if not exists (select 1 from proveedores where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(p)) into v_copia from proveedores p where p.id = any (v_ids);
    -- Completa datos de contacto vacíos con los de los duplicados
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
    delete from proveedores where id = any (v_ids);

  elsif p_catalogo = 'conceptos' then
    if not exists (select 1 from conceptos where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(c)) into v_copia from conceptos c where c.id = any (v_ids);
    update transacciones set concepto_id = p_conservar where concepto_id = any (v_ids);
    get diagnostics v_mov = row_count;
    delete from conceptos where id = any (v_ids);

  elsif p_catalogo = 'clasificaciones' then
    if not exists (select 1 from clasificaciones where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(c)) into v_copia from clasificaciones c where c.id = any (v_ids);
    insert into transaccion_clasificaciones (transaccion_id, clasificacion_id)
      select distinct transaccion_id, p_conservar from transaccion_clasificaciones where clasificacion_id = any (v_ids)
      on conflict do nothing;
    get diagnostics v_mov = row_count;
    delete from transaccion_clasificaciones where clasificacion_id = any (v_ids);
    delete from clasificaciones where id = any (v_ids);
  else
    raise exception 'Catálogo no válido';
  end if;

  insert into fusiones (catalogo, conservado_id, eliminados, movimientos) values (p_catalogo, p_conservar, v_copia, v_mov);
  return v_mov;
end $$;

-- Elimina una clasificación y la quita de todos los movimientos
create or replace function public.eliminar_clasificacion(p_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_mov integer; v_copia jsonb;
begin
  if not privado.es_titular() then raise exception 'Solo el titular puede eliminar clasificaciones'; end if;
  select jsonb_agg(to_jsonb(c)) into v_copia from clasificaciones c where c.id = p_id;
  if v_copia is null then raise exception 'Registro no encontrado'; end if;
  delete from transaccion_clasificaciones where clasificacion_id = p_id;
  get diagnostics v_mov = row_count;
  delete from clasificaciones where id = p_id;
  insert into fusiones (catalogo, conservado_id, eliminados, movimientos) values ('clasificaciones (eliminada)', 0, v_copia, v_mov);
  return v_mov;
end $$;

revoke execute on function public.conteo_usos(text), public.fusionar_catalogo(text, bigint, bigint[]),
  public.eliminar_clasificacion(bigint) from public, anon;
grant execute on function public.conteo_usos(text), public.fusionar_catalogo(text, bigint, bigint[]),
  public.eliminar_clasificacion(bigint) to authenticated;

-- Las fusiones corren con los permisos de quien las ejecuta (solo el titular puede modificar catálogos).
alter function public.fusionar_catalogo(text, bigint, bigint[]) security invoker;
alter function public.eliminar_clasificacion(bigint) security invoker;
create policy fusiones_insert on public.fusiones for insert to authenticated with check ((select privado.es_titular()));
