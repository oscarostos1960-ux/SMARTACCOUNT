"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";

export type NuevaRegla = { clave: string; tipo: "cargo" | "abono"; proveedor_id: number | null; concepto_id: number | null; movimientos: number };

export async function crearReglas(reglas: NuevaRegla[]): Promise<{ creadas?: number; error?: string }> {
  const permisos = await obtenerPermisos();
  if (!permisos.esTitular) return { error: "Solo el titular puede crear reglas." };
  const validas = reglas.filter((r) => r.clave?.trim().length >= 2 && (r.tipo === "cargo" || r.tipo === "abono") && (r.proveedor_id || r.concepto_id));
  if (!validas.length) return { error: "No elegiste ninguna regla." };
  const supabase = await createClient();
  const { data: ya } = await supabase.from("reglas_clasificacion").select("clave, tipo").limit(5000);
  const existentes = new Set((ya ?? []).map((r) => `${r.tipo}|${r.clave}`));
  const nuevas = validas.filter((r) => !existentes.has(`${r.tipo}|${r.clave}`)).map((r) => ({
    clave: r.clave.trim().slice(0, 120), tipo: r.tipo, proveedor_id: r.proveedor_id, concepto_id: r.concepto_id,
    usos: Math.max(0, Math.round(r.movimientos)), origen: "historial",
  }));
  for (let i = 0; i < nuevas.length; i += 200) {
    const { error } = await supabase.from("reglas_clasificacion").insert(nuevas.slice(i, i + 200));
    if (error) return { error: `Se crearon ${i} de ${nuevas.length}; falló una (${error.message}).`, creadas: i };
  }
  revalidatePath("/catalogos/reglas");
  revalidatePath("/catalogos/proponer-reglas");
  return { creadas: nuevas.length };
}
