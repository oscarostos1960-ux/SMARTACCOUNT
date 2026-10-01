-- =============================================================================
-- Smart Account 2 · Fase 3b: avisos de pago al proveedor por WhatsApp y correo
-- Bitácora de cada envío. El estado rápido sigue en transacciones.aviso_whatsapp /
-- aviso_correo ('pendiente' | 'enviado'), como en el sistema anterior.
-- =============================================================================

create table public.avisos (
  id              bigint generated always as identity primary key,
  transaccion_id  bigint not null references public.transacciones(id) on delete cascade,
  canal           text not null check (canal in ('whatsapp','correo')),
  destino         text,                       -- celular o correo al que se envió
  estado          text not null check (estado in ('enviado','error')),
  detalle         text,                       -- respuesta del servicio o motivo del error
  creado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.avisos is 'Avisos de pago enviados a proveedores (WhatsApp y correo)';
create index avisos_transaccion_idx on public.avisos (transaccion_id, created_at desc);
create index avisos_creado_por_idx on public.avisos (creado_por);

alter table public.avisos enable row level security;
create policy avisos_select on public.avisos for select to authenticated
  using (exists (select 1 from public.transacciones t where t.id = transaccion_id));
create policy avisos_insert on public.avisos for insert to authenticated
  with check (exists (select 1 from public.transacciones t where t.id = transaccion_id
              and ((select privado.es_titular()) or (select privado.cuentas_editables()) @> array[t.cuenta_id])));
