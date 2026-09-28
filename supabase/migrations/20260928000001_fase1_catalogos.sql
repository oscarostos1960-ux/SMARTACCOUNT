-- =============================================================================
-- Smart Account 2 · Fase 1: acceso y catálogos
-- Roles:
--   titular   -> control total (Oscar)
--   contador  -> solo consulta (lectura de todo, sin modificar)
--   pendiente -> usuario creado sin permisos todavía
-- Las columnas legacy_id guardan el id del sistema anterior (MySQL) para la migración.
-- =============================================================================

-- ---------- Utilidades --------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Perfiles y roles --------------------------------------------------
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  correo      text,
  rol         text not null default 'pendiente'
              check (rol in ('titular','contador','pendiente')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.perfiles is 'Usuarios del sistema y su rol (titular, contador, pendiente)';

create trigger perfiles_updated before update on public.perfiles
  for each row execute function public.tg_set_updated_at();

-- Rol del usuario actual (security definer para evitar recursión en RLS)
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_titular()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'titular' from public.perfiles where id = auth.uid()), false)
$$;

create or replace function public.puede_consultar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('titular','contador') from public.perfiles where id = auth.uid()), false)
$$;

-- Al crear un usuario: el primero es titular; los demás quedan "pendiente".
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hay_titular boolean;
begin
  select exists(select 1 from public.perfiles where rol = 'titular') into hay_titular;
  insert into public.perfiles (id, nombre, correo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when hay_titular then 'pendiente' else 'titular' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- El usuario no puede cambiarse su propio rol; solo el titular cambia roles.
create or replace function public.tg_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nulo = administrador (SQL Editor / service role): se permite.
  if new.rol is distinct from old.rol and auth.uid() is not null and not public.es_titular() then
    raise exception 'Solo el titular puede cambiar roles';
  end if;
  if old.rol = 'titular' and new.rol <> 'titular'
     and (select count(*) from public.perfiles where rol = 'titular') <= 1 then
    raise exception 'Debe existir al menos un titular';
  end if;
  return new;
end $$;

create trigger perfiles_proteger_rol before update on public.perfiles
  for each row execute function public.tg_proteger_rol();

alter table public.perfiles enable row level security;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_titular());
create policy perfiles_update_propio on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_titular())
  with check (id = auth.uid() or public.es_titular());

-- ---------- Catálogos ---------------------------------------------------------
create table public.bancos (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  activo      boolean not null default true,
  legacy_id   integer unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index bancos_nombre_uq on public.bancos (lower(nombre));

create table public.monedas (
  id           bigint generated always as identity primary key,
  codigo       text not null unique check (codigo ~ '^[A-Z]{3}$'),
  nombre       text not null,
  tipo_cambio  numeric(14,6) not null default 1 check (tipo_cambio > 0),
  actualizado  timestamptz,
  activo       boolean not null default true,
  legacy_id    integer unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.tipos_cuenta (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  naturaleza  text not null default 'otro'
              check (naturaleza in ('cheques','credito','inversion','efectivo','otro')),
  activo      boolean not null default true,
  legacy_id   integer unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tipos_cuenta_nombre_uq on public.tipos_cuenta (lower(nombre));

create table public.cuentas (
  id              bigint generated always as identity primary key,
  nombre          text not null,
  descripcion     text,
  banco_id        bigint references public.bancos(id),
  tipo_cuenta_id  bigint references public.tipos_cuenta(id),
  moneda_id       bigint not null references public.monedas(id),
  saldo_inicial   numeric(14,2) not null default 0,
  terminacion     text check (terminacion is null or terminacion ~ '^[0-9]{4}$'),
  activa          boolean not null default true,
  legacy_id       integer unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.cuentas.terminacion is 'Últimos 4 dígitos (nunca el número completo)';

create table public.proveedores (
  id                  bigint generated always as identity primary key,
  nombre              text not null,
  apellido_paterno    text,
  apellido_materno    text,
  razon_social        text,
  rfc                 text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  correo              text check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono            text,
  celular             text check (celular is null or celular ~ '^[0-9]{10}$'),
  notas               text,
  notificar_whatsapp  boolean not null default true,
  notificar_correo    boolean not null default true,
  activo              boolean not null default true,
  legacy_id           integer unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on column public.proveedores.celular is '10 dígitos (México); el prefijo 521 se agrega al enviar WhatsApp';
create index proveedores_busqueda_idx on public.proveedores
  using gin (to_tsvector('spanish', coalesce(nombre,'')||' '||coalesce(apellido_paterno,'')||' '||coalesce(razon_social,'')||' '||coalesce(rfc,'')));

create table public.conceptos (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  activo      boolean not null default true,
  legacy_id   integer unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index conceptos_nombre_uq on public.conceptos (lower(nombre));

create table public.clasificaciones (
  id           bigint generated always as identity primary key,
  nombre       text not null,
  descripcion  text,
  color        text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  activo       boolean not null default true,
  legacy_id    integer unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index clasificaciones_nombre_uq on public.clasificaciones (lower(nombre));

-- updated_at + RLS para todos los catálogos
do $$
declare t text;
begin
  foreach t in array array['bancos','monedas','tipos_cuenta','cuentas','proveedores','conceptos','clasificaciones'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tg_set_updated_at()', t||'_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_consultar())', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.es_titular())', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.es_titular()) with check (public.es_titular())', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.es_titular())', t||'_delete', t);
  end loop;
end $$;

-- Las funciones de trigger no se llaman directamente desde la API
revoke execute on function public.tg_nuevo_usuario() from public, anon, authenticated;
revoke execute on function public.tg_proteger_rol() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;

-- ---------- Datos iniciales ---------------------------------------------------
insert into public.monedas (codigo, nombre, tipo_cambio) values
  ('MXN','Peso mexicano',1), ('USD','Dólar estadounidense',18.5), ('EUR','Euro',20);
insert into public.tipos_cuenta (nombre, naturaleza) values
  ('Cheques','cheques'), ('Tarjeta de crédito','credito'), ('Inversión','inversion'), ('Efectivo','efectivo');
