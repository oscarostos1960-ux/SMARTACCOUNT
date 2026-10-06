-- Leyenda 1 y 2 del pago programado en la vista de vencimientos (se agregan al final de la vista)
create or replace view public.v_vencimientos with (security_invoker = true) as
 SELECT v.id, v.pago_id, v.fecha, v.estado, v.notas, v.transaccion_id, v.pagado_en,
    COALESCE(v.importe, GREATEST(p.cargo, p.abono)) AS importe,
    v.importe IS NOT NULL AS importe_cambiado,
    CASE WHEN p.abono > p.cargo THEN 'abono'::text ELSE 'cargo'::text END AS tipo,
    p.cuenta_id, c.nombre AS cuenta, COALESCE(mo.codigo, 'MXN'::text) AS moneda,
    p.proveedor_id,
    COALESCE(NULLIF(pr.razon_social, ''::text), concat_ws(' '::text, pr.nombre, pr.apellido_paterno, pr.apellido_materno)) AS proveedor,
    p.concepto_id, co.nombre AS concepto, p.descripcion, p.frecuencia, p.activo, p.avisar_whatsapp, p.avisar_correo,
    t.folio, t.cuenta_id AS cuenta_pago_id, tc.nombre AS cuenta_pago,
    p.leyenda1, p.leyenda2
   FROM vencimientos v
     JOIN pagos_programados p ON p.id = v.pago_id
     LEFT JOIN cuentas c ON c.id = p.cuenta_id
     LEFT JOIN monedas mo ON mo.id = c.moneda_id
     LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
     LEFT JOIN conceptos co ON co.id = p.concepto_id
     LEFT JOIN transacciones t ON t.id = v.transaccion_id
     LEFT JOIN cuentas tc ON tc.id = t.cuenta_id;
