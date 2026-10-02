-- Fase 4 · Reglas para sugerir "A favor de" y concepto al importar.
-- 1) Reglas aprendidas por comercio ("clave" = nombre limpio del comercio, sin referencias ni ciudades).
-- 2) Palabras clave y concepto habitual por proveedor.

create table public.reglas_clasificacion (
  id            bigint generated always as identity primary key,
  clave         text not null check (length(clave) between 2 and 120),
  tipo          text not null default 'cargo' check (tipo in ('cargo', 'abono', 'ambos')),
  proveedor_id  bigint references public.proveedores (id) on delete set null,
  concepto_id   bigint references public.conceptos (id) on delete set null,
  usos          integer not null default 0,
  origen        text not null default 'usuario' check (origen in ('usuario', 'historial')),
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint reglas_clasificacion_clave_tipo_uq unique (clave, tipo)
);
comment on table public.reglas_clasificacion is 'Reglas para sugerir A favor de y concepto en el importador: el comercio (clave) se clasifica siempre igual.';
create index reglas_clasificacion_proveedor_idx on public.reglas_clasificacion (proveedor_id);
create index reglas_clasificacion_concepto_idx on public.reglas_clasificacion (concepto_id);

create trigger reglas_clasificacion_updated before update on public.reglas_clasificacion
  for each row execute function public.tg_set_updated_at();

alter table public.reglas_clasificacion enable row level security;
create policy reglas_select on public.reglas_clasificacion for select to authenticated using ((select privado.puede_consultar()));
-- El titular o quien puede capturar en alguna cuenta (el importador aprende de lo que se importa)
create policy reglas_insert on public.reglas_clasificacion for insert to authenticated
  with check ((select privado.es_titular()) or coalesce(array_length((select privado.cuentas_editables()), 1), 0) > 0);
create policy reglas_update on public.reglas_clasificacion for update to authenticated
  using ((select privado.es_titular()) or coalesce(array_length((select privado.cuentas_editables()), 1), 0) > 0)
  with check ((select privado.es_titular()) or coalesce(array_length((select privado.cuentas_editables()), 1), 0) > 0);
create policy reglas_delete on public.reglas_clasificacion for delete to authenticated using ((select privado.es_titular()));

alter table public.proveedores
  add column palabras_clave text,
  add column concepto_id bigint references public.conceptos (id) on delete set null;
comment on column public.proveedores.palabras_clave is 'Otros nombres con que aparece en los estados de cuenta, separados por coma (p. ej. GNP, TELMEX).';
comment on column public.proveedores.concepto_id is 'Concepto que se sugiere por omisión para este proveedor.';
create index proveedores_concepto_idx on public.proveedores (concepto_id);

-- Nombre visible del proveedor (razón social o nombre completo), para listas
create view public.v_proveedores_etiqueta with (security_invoker = true) as
  select id, coalesce(nullif(razon_social, ''), concat_ws(' ', nombre, apellido_paterno, apellido_materno)) as etiqueta, activo
  from public.proveedores;

-- Concepto más usado con cada proveedor
create view public.v_concepto_habitual with (security_invoker = true) as
  select distinct on (proveedor_id) proveedor_id, concepto_id, n
  from (select proveedor_id, concepto_id, count(*) as n from public.transacciones
        where proveedor_id is not null and concepto_id is not null group by 1, 2) x
  order by proveedor_id, n desc;

-- Fusionar catálogos: también las reglas y el concepto habitual de los proveedores
create or replace function public.fusionar_catalogo(p_catalogo text, p_conservar bigint, p_eliminar bigint[])
 returns integer language plpgsql set search_path to 'public'
as $function$
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
      razon_social = coalesce(k.razon_social, d.razon_social),
      concepto_id = coalesce(k.concepto_id, d.concepto_id),
      palabras_clave = nullif(concat_ws(', ', k.palabras_clave, d.palabras_clave), '')
    from (select (array_agg(rfc) filter (where rfc is not null))[1] rfc,
                 (array_agg(correo) filter (where correo is not null))[1] correo,
                 (array_agg(celular) filter (where celular is not null))[1] celular,
                 (array_agg(telefono) filter (where telefono is not null))[1] telefono,
                 (array_agg(razon_social) filter (where razon_social is not null))[1] razon_social,
                 (array_agg(concepto_id) filter (where concepto_id is not null))[1] concepto_id,
                 string_agg(palabras_clave, ', ') filter (where palabras_clave is not null) palabras_clave
          from proveedores where id = any (v_ids)) d
    where k.id = p_conservar;
    update transacciones set proveedor_id = p_conservar where proveedor_id = any (v_ids);
    get diagnostics v_mov = row_count;
    update pagos_programados set proveedor_id = p_conservar where proveedor_id = any (v_ids);
    update reglas_clasificacion set proveedor_id = p_conservar where proveedor_id = any (v_ids);
    delete from proveedores where id = any (v_ids);

  elsif p_catalogo = 'conceptos' then
    if not exists (select 1 from conceptos where id = p_conservar) then raise exception 'Registro no encontrado'; end if;
    select jsonb_agg(to_jsonb(c)) into v_copia from conceptos c where c.id = any (v_ids);
    update transacciones set concepto_id = p_conservar where concepto_id = any (v_ids);
    get diagnostics v_mov = row_count;
    update pagos_programados set concepto_id = p_conservar where concepto_id = any (v_ids);
    update reglas_clasificacion set concepto_id = p_conservar where concepto_id = any (v_ids);
    update proveedores set concepto_id = p_conservar where concepto_id = any (v_ids);
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
end $function$;
