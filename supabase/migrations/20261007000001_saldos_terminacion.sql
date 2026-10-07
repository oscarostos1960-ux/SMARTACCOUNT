-- Mostrar los últimos 4 dígitos de la cuenta en las tarjetas de saldos
create or replace view public.v_saldos_cuentas with (security_invoker = true) as
 SELECT c.id AS cuenta_id,
    c.nombre,
    c.activa,
    m.codigo AS moneda,
    tc.nombre AS tipo_cuenta,
    tc.naturaleza,
    b.nombre AS banco,
    c.saldo_inicial,
    c.saldo_inicial + COALESCE(sum(t.abono - t.cargo), 0::numeric) AS saldo,
    count(t.id) AS movimientos,
    max(t.fecha) AS ultimo_movimiento,
    c.terminacion
   FROM cuentas c
     JOIN monedas m ON m.id = c.moneda_id
     LEFT JOIN tipos_cuenta tc ON tc.id = c.tipo_cuenta_id
     LEFT JOIN bancos b ON b.id = c.banco_id
     LEFT JOIN transacciones t ON t.cuenta_id = c.id
  GROUP BY c.id, m.codigo, tc.nombre, tc.naturaleza, b.nombre;
