-- =============================================================================
-- Smart Account 2 · Fase 4: importación de estados de cuenta (PDF / XML) con IA
--  · importaciones: cada archivo leído, con lo que la IA encontró y el resultado.
--  · Bucket privado "estados": los archivos originales, en <usuario>/<archivo>.
--  · transacciones.importacion_id: de qué estado de cuenta vino cada movimiento.
-- =============================================================================

create table public.importaciones (
  id               bigint generated always as identity primary key,
  usuario_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  archivo_nombre   text not null,
  archivo_ruta     text not null unique,               -- ruta en el bucket "estados"
  archivo_tipo     text not null check (archivo_tipo in ('pdf','xml')),
  archivo_huella   text,                               -- sha256, para avisar si ya se importó
  estado           text not null default 'leyendo' check (estado in ('leyendo','leido','error','importado','descartado')),
  error            text,
  cuenta_id        bigint references public.cuentas(id) on delete set null,
  banco            text,
  terminacion      text,                               -- últimos 4 dígitos detectados
  periodo_inicio   date,
  periodo_fin      date,
  saldo_inicial    numeric(14,2),
  saldo_final      numeric(14,2),
  datos            jsonb,                              -- respuesta de la IA (movimientos)
  modelo           text,
  movimientos_importados integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.importaciones is 'Estados de cuenta leídos con IA y su resultado';
create index importaciones_usuario_idx on public.importaciones (usuario_id, created_at desc);
create index importaciones_cuenta_idx on public.importaciones (cuenta_id);
create index importaciones_huella_idx on public.importaciones (archivo_huella);
create trigger importaciones_updated before update on public.importaciones
  for each row execute function public.tg_set_updated_at();

alter table public.importaciones enable row level security;
-- Cada quien ve lo que subió; el titular ve todo.
create policy importaciones_select on public.importaciones for select to authenticated
  using (usuario_id = (select auth.uid()) or (select privado.es_titular()));
create policy importaciones_insert on public.importaciones for insert to authenticated
  with check (usuario_id = (select auth.uid())
              and ((select privado.es_titular()) or cardinality((select privado.cuentas_editables())) > 0));
create policy importaciones_update on public.importaciones for update to authenticated
  using (usuario_id = (select auth.uid()) or (select privado.es_titular()))
  with check (usuario_id = (select auth.uid()) or (select privado.es_titular()));
create policy importaciones_delete on public.importaciones for delete to authenticated
  using (usuario_id = (select auth.uid()) or (select privado.es_titular()));

alter table public.transacciones add column importacion_id bigint references public.importaciones(id) on delete set null;
create index transacciones_importacion_idx on public.transacciones (importacion_id) where importacion_id is not null;

-- Archivos originales: bucket privado, cada usuario en su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estados', 'estados', false, 33554432, array['application/pdf','text/xml','application/xml'])
on conflict (id) do nothing;

create policy estados_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'estados' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select privado.es_titular())));
create policy estados_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'estados' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy estados_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'estados' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select privado.es_titular())));
