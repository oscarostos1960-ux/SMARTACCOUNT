import { createClient } from "@/lib/supabase/server";
import {
  COLUMNAS, COLUMNAS_REPORTE, leerColumnas, leerFiltros, parametrosBusqueda, type Movimiento,
} from "@/lib/transacciones";

// Descarga en CSV (se abre directo en Excel) los movimientos filtrados, con las columnas elegidas.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión", { status: 401 });

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filtros = leerFiltros(sp);
  const columnas = leerColumnas(sp.columnas, COLUMNAS_REPORTE);
  const orden = sp.orden === "folio" ? "folio" : "fecha";
  const { data: clasif } = await supabase.from("clasificaciones").select("id, nombre");
  const nombreClasif = new Map((clasif ?? []).map((c) => [Number(c.id), String(c.nombre)]));

  const filas: Movimiento[] = [];
  const LOTE = 5000;
  for (let offset = 0; offset < 200000; offset += LOTE) {
    const { data, error } = await supabase.rpc("buscar_movimientos", parametrosBusqueda(filtros.cuentas ?? null, filtros, orden, LOTE, offset));
    if (error) return new Response(`No se pudo exportar: ${error.message}`, { status: 500 });
    filas.push(...((data ?? []) as Movimiento[]));
    if (!data || data.length < LOTE) break;
  }

  const celda = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const valor = (m: Movimiento, c: (typeof columnas)[number]) => {
    switch (c) {
      case "cargo": case "abono": case "saldo": return Number(m[c]).toFixed(2);
      case "clasificaciones": return (m.clasificaciones ?? []).map((x) => nombreClasif.get(Number(x))).filter(Boolean).join(" / ");
      default: return m[c];
    }
  };
  const lista = COLUMNAS.filter((c) => columnas.includes(c.clave));
  const encabezado = lista.map((c) => c.etiqueta);
  if (columnas.includes("cargo") || columnas.includes("abono") || columnas.includes("saldo")) encabezado.push("Moneda");
  const lineas = [encabezado.map(celda).join(",")];
  const cronologico = filas.reverse();
  for (const m of cronologico) {
    const fila = lista.map((c) => valor(m, c.clave));
    if (encabezado.length > lista.length) fila.push(m.moneda);
    lineas.push(fila.map(celda).join(","));
  }

  const hoy = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lineas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos_${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
