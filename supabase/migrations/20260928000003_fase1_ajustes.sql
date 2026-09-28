-- Funciones de permisos en un esquema privado (no expuesto por la API).
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
alter function public.es_titular() set schema privado;
alter function public.puede_consultar() set schema privado;

-- El trigger de roles usa la función movida
create or replace function public.tg_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from old.rol and auth.uid() is not null and not privado.es_titular() then
    raise exception 'Solo el titular puede cambiar roles';
  end if;
  if old.rol = 'titular' and new.rol <> 'titular'
     and (select count(*) from public.perfiles where rol = 'titular') <= 1 then
    raise exception 'Debe existir al menos un titular';
  end if;
  return new;
end $$;
revoke execute on function public.tg_proteger_rol() from public, anon, authenticated;

-- Políticas de perfiles con auth.uid() evaluado una sola vez
drop policy perfiles_select on public.perfiles;
drop policy perfiles_update_propio on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select privado.es_titular()));
create policy perfiles_update_propio on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or (select privado.es_titular()))
  with check (id = (select auth.uid()) or (select privado.es_titular()));

-- Índices para llaves foráneas; la búsqueda de proveedores se hace en pantalla.
create index cuentas_banco_idx on public.cuentas (banco_id);
create index cuentas_tipo_idx on public.cuentas (tipo_cuenta_id);
create index cuentas_moneda_idx on public.cuentas (moneda_id);
drop index if exists public.proveedores_busqueda_idx;
