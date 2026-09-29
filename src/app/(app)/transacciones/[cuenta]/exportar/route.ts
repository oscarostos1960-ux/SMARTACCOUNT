import { createClient } from "@/lib/supabase/server";
import { leerFiltros, parametrosBusqueda, type Movimiento } from "@/lib/transacciones";

// Descarga los movimientos filtrados en CSV (se abre directo en Excel).
export async function GET(request: Request, ctx: RouteContext<"/transacciones/[cuenta]/exportar">) {
  const { cuenta } = await ctx.params;
  const cuentaId = Number(cuenta);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) return new Response("Cuenta no válida", { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión", { status: 401 });

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filtros = leerFiltros(sp);
  const [{ data: info }, { data: clasif }] = await Promise.all([
    supabase.from("cuentas").select("nombre").eq("id", cuentaId).maybeSingle(),
    supabase.from("clasificaciones").select("id, nombre"),
  ]);
  if (!info) return new Response("Cuenta no encontrada", { status: 404 });
  const nombreClasif = new Map((clasif ?? []).map((c) => [Number(c.id), String(c.nombre)]));

  const filas: Movimiento[] = [];
  const LOTE = 5000;
  for (let offset = 0; offset < 100000; offset += LOTE) {
    const { data, error } = await supabase.rpc("buscar_transacciones", parametrosBusqueda(cuentaId, filtros, LOTE, offset));
    if (error) return new Response(`No se pudo exportar: ${error.message}`, { status: 500 });
    filas.push(...((data ?? []) as Movimiento[]));
    if (!data || data.length < LOTE) break;
  }

  const celda = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = ["Folio", "Fecha", "Transacción", "Concepto", "Proveedor", "Referencia", "Cargo", "Abono", "Saldo",
    "Clasificaciones", "Leyenda 1", "Leyenda 2", "Leyenda 3", "Observaciones"];
  const lineas = [encabezado.join(",")];
  for (const m of filas.reverse()) {
    lineas.push([
      m.folio, m.fecha, m.descripcion, m.concepto, m.proveedor, m.referencia,
      Number(m.cargo).toFixed(2), Number(m.abono).toFixed(2), Number(m.saldo).toFixed(2),
      (m.clasificaciones ?? []).map((c) => nombreClasif.get(Number(c))).filter(Boolean).join(" / "),
      m.leyenda1, m.leyenda2, m.leyenda3, m.observaciones,
    ].map(celda).join(","));
  }

  const nombre = `${info.nombre}`.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_") || "cuenta";
  return new Response("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos_${encodeURIComponent(nombre)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
