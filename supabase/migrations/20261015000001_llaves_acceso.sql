-- Entrar con Face ID / huella (passkeys / WebAuthn).
-- Cada teléfono o computadora donde el usuario lo activa guarda aquí su llave pública.
-- La llave privada nunca sale del teléfono; Smart Account solo comprueba la firma.
create table public.llaves_acceso (
  id             bigint generated always as identity primary key,
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  credencial_id  text not null unique,            -- base64url
  clave_publica  text not null,                   -- SPKI DER en base64
  algoritmo      integer not null,                -- -7 ES256, -257 RS256
  contador       bigint not null default 0,
  dominio        text not null,                   -- smartaccountia.com, etc.
  nombre         text,                            -- "iPhone", "Android"…
  ultimo_uso     timestamptz,
  created_at     timestamptz not null default now()
);
create index llaves_acceso_usuario_idx on public.llaves_acceso (usuario_id);

alter table public.llaves_acceso enable row level security;
create policy llaves_select on public.llaves_acceso for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy llaves_insert on public.llaves_acceso for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy llaves_delete on public.llaves_acceso for delete to authenticated
  using (usuario_id = (select auth.uid()));
