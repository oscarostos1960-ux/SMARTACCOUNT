import { createClient } from "@/lib/supabase/server";
import { aplicarFiltros, CANAL_TEXTO, ESTADO_TEXTO, fechaHoraCDMX, leerFiltrosComprobantes, type Comprobante } from "@/lib/comprobantes";

// Descarga en CSV (se abre directo en Excel) el reporte de comprobantes con los filtros de la pantalla.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión", { status: 401 });

  const f = leerFiltrosComprobantes(Object.fromEntries(new URL(request.url).searchParams));
  const filas: Comprobante[] = [];
  const LOTE = 1000;
  for (let desde = 0; desde < 100000; desde += LOTE) {
    const { data, error } = await aplicarFiltros(supabase.from("v_comprobantes_enviados").select("*"), f)
      .order("fecha_envio", { ascending: false }).order("enviado_en", { ascending: false, nullsFirst: false }).order("folio", { ascending: false })
      .range(desde, desde + LOTE - 1);
    if (error) return new Response(`No se pudo exportar: ${error.message}`, { status: 500 });
    filas.push(...((data ?? []) as Comprobante[]));
    if (!data || data.length < LOTE) break;
  }

  const celda = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = ["Enviado el", "Medio", "Estado", "A quién (proveedor)", "Celular / correo", "Envió", "Fecha del pago", "Cuenta", "Folio",
    "Importe", "Moneda", "Concepto", "Transacción", "Leyenda 1", "Leyenda 2", "Detalle"];
  const lineas = [encabezado.map(celda).join(",")];
  for (const r of filas) {
    lineas.push([
      r.enviado_en ? fechaHoraCDMX(r.enviado_en) : r.estado === "pendiente" || r.estado === "espera" ? "" : `${r.fecha} (sistema anterior)`,
      CANAL_TEXTO[r.canal], ESTADO_TEXTO[r.estado], r.proveedor, r.destino, r.enviado_por, r.fecha, r.cuenta, r.folio,
      (Number(r.cargo) || Number(r.abono)).toFixed(2), r.moneda, r.concepto, r.descripcion, r.leyenda1, r.leyenda2, r.estado === "error" ? r.detalle : "",
    ].map(celda).join(","));
  }
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comprobantes_${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
