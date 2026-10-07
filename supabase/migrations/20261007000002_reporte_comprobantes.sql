-- Reporte de comprobantes de pago enviados: a quién, cuándo y por qué medio.
-- Une los avisos enviados desde Smart Account (tabla avisos) con las marcas del sistema anterior
-- (transacciones.aviso_whatsapp / aviso_correo = 'enviado' | 'pendiente') cuando ese canal no tiene avisos registrados:
-- 'enviado' sin aviso = enviado en el sistema anterior (sin fecha ni destino); 'pendiente' = se pidió avisar y no se ha enviado.
create or replace view public.v_comprobantes_enviados with (security_invoker = true) as
with base as not materialized (
  select t.id as transaccion_id, t.cuenta_id, c.nombre as cuenta, t.folio, t.fecha, t.cargo, t.abono, m.codigo as moneda,
         t.proveedor_id,
         coalesce(nullif(p.razon_social, ''), concat_ws(' ', p.nombre, p.apellido_paterno, p.apellido_materno)) as proveedor,
         co.nombre as concepto, t.descripcion, t.leyenda1, t.leyenda2, t.aviso_whatsapp, t.aviso_correo
  from transacciones t
  join cuentas c on c.id = t.cuenta_id
  join monedas m on m.id = c.moneda_id
  left join conceptos co on co.id = t.concepto_id
  left join proveedores p on p.id = t.proveedor_id
)
select 'a' || a.id as id, 'smart' as origen, b.*, a.canal, a.destino, a.estado, a.detalle,
       a.created_at as enviado_en, (a.created_at at time zone 'America/Mexico_City')::date as fecha_envio,
       coalesce(pe.nombre, pe.correo) as enviado_por
from avisos a
join base b on b.transaccion_id = a.transaccion_id
left join perfiles pe on pe.id = a.creado_por
union all
select 'w' || b.transaccion_id, 'marca', b.*, 'whatsapp', null, b.aviso_whatsapp, null, null, b.fecha, null
from base b where b.aviso_whatsapp in ('enviado', 'pendiente')
  and not exists (select 1 from avisos a where a.transaccion_id = b.transaccion_id and a.canal = 'whatsapp')
union all
select 'c' || b.transaccion_id, 'marca', b.*, 'correo', null, b.aviso_correo, null, null, b.fecha, null
from base b where b.aviso_correo in ('enviado', 'pendiente')
  and not exists (select 1 from avisos a where a.transaccion_id = b.transaccion_id and a.canal = 'correo');

comment on view public.v_comprobantes_enviados is 'Comprobantes de pago enviados (o pendientes) por WhatsApp o correo, del sistema nuevo y del anterior';
