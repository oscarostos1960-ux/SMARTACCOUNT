-- =============================================================================
-- Smart Account · Espacios: cada cliente tiene sus propios datos (todo en blanco).
-- - Lo que ya existe queda en el espacio "principal" (Oscar) sin cambios.
-- - Cada usuario pertenece a un espacio; solo ve y modifica lo de su espacio.
--   La separación la hace la base de datos (políticas RLS restrictivas).
-- - Bancos, cuentas, proveedores, conceptos, clasificaciones, reglas, pagos
--   programados, importaciones y fusiones llevan espacio_id.
-- - Monedas y tipos de cuenta son comunes; solo el titular del espacio principal los cambia.
-- - Claves de IA y contraseñas de correo: tabla espacio_secretos (cifradas desde la app),
--   sin acceso desde la API para usuarios; solo el servidor con la llave de servicio.
-- =============================================================================

-- ---------- Espacios ----------------------------------------------------------
create table public.espacios (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  principal         boolean not null default false,
  titular_id        uuid references auth.users(id) on delete set null,
  correo_remitente  text,            -- correo propio para avisos (si lo configura)
  correo_nombre     text,            -- nombre que ve el proveedor
  smtp_host         text,
  smtp_puerto       integer,
  smtp_activo       boolean not null default false,
  ia_clave_fin      text,            -- últimos 4 caracteres de la clave de IA (para mostrar)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index espacios_principal_uq on public.espacios (principal) where principal;
create trigger espacios_updated before update on public.espacios
  for each row execute function public.tg_set_updated_at();

create table public.espacio_secretos (
  espacio_id       bigint primary key references public.espacios(id) on delete cascade,
  ia_clave         text,    -- cifrada (AES-256-GCM) por la app
  smtp_contrasena  text,    -- cifrada (AES-256-GCM) por la app
  updated_at       timestamptz not null default now()
);
alter table public.espacio_secretos enable row level security;   -- sin políticas: nadie desde la API
revoke all on public.espacio_secretos from anon, authenticated;

insert into public.espacios (nombre, principal, titular_id)
select coalesce((select nombre from public.perfiles where rol = 'titular' order by created_at limit 1), 'Principal'),
       true,
       (select id from public.perfiles where rol = 'titular' order by created_at limit 1);

alter table public.perfiles add column espacio_id bigint references public.espacios(id);
update public.perfiles set espacio_id = (select id from public.espacios where principal);
alter table public.perfiles alter column espacio_id set not null;
create index perfiles_espacio_idx on public.perfiles (espacio_id);

-- ---------- Funciones de permisos --------------------------------------------
create or replace function privado.mi_espacio()
returns bigint language sql stable security definer set search_path = public as $$
  select espacio_id from public.perfiles where id = auth.uid()
$$;

create or replace function privado.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.rol = 'titular' and e.principal
                   from public.perfiles p join public.espacios e on e.id = p.espacio_id
                   where p.id = auth.uid()), false)
$$;

create or replace function privado.usuarios_espacio()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id::text), '{}') from public.perfiles p
  where p.espacio_id = (select espacio_id from public.perfiles where id = auth.uid())
$$;

-- Valor por omisión de espacio_id: el del usuario; desde el SQL Editor (sin usuario), el principal
create or replace function privado.espacio_por_omision()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select espacio_id from public.perfiles where id = auth.uid()),
                  (select id from public.espacios where principal))
$$;

revoke execute on function privado.espacio_por_omision() from public, anon;
grant execute on function privado.espacio_por_omision() to authenticated;
revoke execute on function privado.mi_espacio(), privado.es_admin(), privado.usuarios_espacio() from public, anon;
grant execute on function privado.mi_espacio(), privado.es_admin(), privado.usuarios_espacio() to authenticated;

alter table public.espacios enable row level security;
create policy espacios_select on public.espacios for select to authenticated
  using (id = (select privado.mi_espacio()) or (select privado.es_admin()));
revoke insert, update, delete on public.espacios from anon, authenticated;   -- se modifican desde el servidor

-- ---------- espacio_id en tablas propias de cada cliente ---------------------
do $$
declare t text; principal bigint := (select id from public.espacios where principal);
begin
  foreach t in array array['bancos','cuentas','proveedores','conceptos','clasificaciones',
                           'reglas_clasificacion','pagos_programados','importaciones','fusiones'] loop
    execute format('alter table public.%I add column espacio_id bigint references public.espacios(id)', t);
    execute format('update public.%I set espacio_id = %s', t, principal);
    execute format('alter table public.%I alter column espacio_id set default privado.espacio_por_omision()', t);
    execute format('alter table public.%I alter column espacio_id set not null', t);
    execute format('create index %I on public.%I (espacio_id)', t || '_espacio_idx', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated
                      using (espacio_id = (select privado.mi_espacio()))
                      with check (espacio_id = (select privado.mi_espacio()))', t || '_espacio', t);
  end loop;
end $$;

create or replace function privado.cuentas_espacio()
returns bigint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.id), '{}') from public.cuentas c
  where c.espacio_id = (select espacio_id from public.perfiles where id = auth.uid())
$$;

revoke execute on function privado.cuentas_espacio() from public, anon;
grant execute on function privado.cuentas_espacio() to authenticated;

-- Nombres únicos por espacio (dos clientes pueden tener el mismo banco o concepto)
drop index if exists public.bancos_nombre_uq;
drop index if exists public.conceptos_nombre_uq;
drop index if exists public.clasificaciones_nombre_uq;
alter table public.reglas_clasificacion drop constraint if exists reglas_clasificacion_clave_tipo_uq;
create unique index bancos_nombre_uq on public.bancos (espacio_id, lower(nombre));
create unique index conceptos_nombre_uq on public.conceptos (espacio_id, lower(nombre));
create unique index clasificaciones_nombre_uq on public.clasificaciones (espacio_id, lower(nombre));
create unique index reglas_clasificacion_clave_tipo_uq on public.reglas_clasificacion (espacio_id, clave, tipo);

-- ---------- Tablas que dependen de una cuenta, movimiento o pago -------------
create policy transacciones_espacio on public.transacciones as restrictive for all to authenticated
  using ((select privado.cuentas_espacio()) @> array[cuenta_id])
  with check ((select privado.cuentas_espacio()) @> array[cuenta_id]);

create policy avisos_espacio on public.avisos as restrictive for all to authenticated
  using (exists (select 1 from public.transacciones t where t.id = avisos.transaccion_id))
  with check (exists (select 1 from public.transacciones t where t.id = avisos.transaccion_id));
create policy documentos_espacio on public.documentos as restrictive for all to authenticated
  using (exists (select 1 from public.transacciones t where t.id = documentos.transaccion_id))
  with check (exists (select 1 from public.transacciones t where t.id = documentos.transaccion_id));
create policy transaccion_clasificaciones_espacio on public.transaccion_clasificaciones as restrictive for all to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_clasificaciones.transaccion_id))
  with check (exists (select 1 from public.transacciones t where t.id = transaccion_clasificaciones.transaccion_id)
              and exists (select 1 from public.clasificaciones c where c.id = transaccion_clasificaciones.clasificacion_id));

create policy vencimientos_espacio on public.vencimientos as restrictive for all to authenticated
  using (exists (select 1 from public.pagos_programados p where p.id = vencimientos.pago_id))
  with check (exists (select 1 from public.pagos_programados p where p.id = vencimientos.pago_id));
create policy pago_prog_clasif_espacio on public.pago_programado_clasificaciones as restrictive for all to authenticated
  using (exists (select 1 from public.pagos_programados p where p.id = pago_programado_clasificaciones.pago_id))
  with check (exists (select 1 from public.pagos_programados p where p.id = pago_programado_clasificaciones.pago_id)
              and exists (select 1 from public.clasificaciones c where c.id = pago_programado_clasificaciones.clasificacion_id));

create policy permisos_espacio on public.permisos_cuenta as restrictive for all to authenticated
  using ((select privado.cuentas_espacio()) @> array[cuenta_id] and (select privado.usuarios_espacio()) @> array[usuario_id::text])
  with check ((select privado.cuentas_espacio()) @> array[cuenta_id] and (select privado.usuarios_espacio()) @> array[usuario_id::text]);

create policy perfiles_espacio on public.perfiles as restrictive for all to authenticated
  using (espacio_id = (select privado.mi_espacio()))
  with check (espacio_id = (select privado.mi_espacio()));

-- Archivos: comprobantes por cuenta y estados de cuenta por usuario, solo del propio espacio
create policy archivos_espacio on storage.objects as restrictive for all to authenticated
  using (
    bucket_id not in ('documentos', 'estados')
    or (bucket_id = 'documentos' and (select privado.cuentas_espacio()) @> array[((storage.foldername(name))[1])::bigint])
    or (bucket_id = 'estados' and (select privado.usuarios_espacio()) @> array[(storage.foldername(name))[1]]))
  with check (
    bucket_id not in ('documentos', 'estados')
    or (bucket_id = 'documentos' and (select privado.cuentas_espacio()) @> array[((storage.foldername(name))[1])::bigint])
    or (bucket_id = 'estados' and (select privado.usuarios_espacio()) @> array[(storage.foldername(name))[1]]));

-- ---------- Catálogos comunes: solo el titular del espacio principal los cambia ----
do $$
declare t text; c text;
begin
  foreach t in array array['monedas','tipos_cuenta'] loop
    foreach c in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s ((select privado.es_admin()))',
                     t || '_admin_' || c, t, c, case when c = 'insert' then 'with check' else 'using' end);
    end loop;
  end loop;
end $$;

-- ---------- Alta de usuarios y roles por espacio -----------------------------
-- El espacio y el rol inicial vienen de app_metadata (solo el servidor puede ponerlos).
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_espacio bigint;
  v_rol text;
begin
  v_espacio := coalesce(nullif(new.raw_app_meta_data->>'espacio_id', '')::bigint,
                        (select id from public.espacios where principal));
  v_rol := case
    when new.raw_app_meta_data->>'rol' = 'titular' then 'titular'
    when not exists (select 1 from public.perfiles where rol = 'titular') then 'titular'
    else 'pendiente' end;
  insert into public.perfiles (id, nombre, correo, rol, espacio_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email, v_rol, v_espacio);
  return new;
end $$;

create or replace function public.tg_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.espacio_id is distinct from old.espacio_id and auth.uid() is not null then
    raise exception 'No se puede cambiar el espacio de un usuario';
  end if;
  if new.rol is distinct from old.rol and auth.uid() is not null and not privado.es_titular() then
    raise exception 'Solo el titular puede cambiar roles';
  end if;
  if old.rol = 'titular' and new.rol <> 'titular'
     and (select count(*) from public.perfiles where rol = 'titular' and espacio_id = old.espacio_id) <= 1 then
    raise exception 'Debe existir al menos un titular';
  end if;
  return new;
end $$;
revoke execute on function public.tg_nuevo_usuario() from public, anon, authenticated;
revoke execute on function public.tg_proteger_rol() from public, anon, authenticated;
