import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { claveComercio, tipoMovimiento, type ProveedorCat, type Regla } from "./sugerencias";
import type { CatalogosSugerencia } from "./analisis";

type Supa = Awaited<ReturnType<typeof createClient>>;

// Reglas, proveedores (con palabras clave) y concepto habitual, para las sugerencias del importador.
export async function cargarCatalogosSugerencia(supabase: Supa): Promise<CatalogosSugerencia> {
  const [rR, pR, cR, kR] = await Promise.all([
    supabase.from("reglas_clasificacion").select("id, clave, tipo, proveedor_id, concepto_id").eq("activa", true).limit(5000),
    supabase.from("proveedores").select("id, nombre, apellido_paterno, apellido_materno, razon_social, palabras_clave, concepto_id, activo").limit(5000),
    supabase.from("v_concepto_habitual").select("proveedor_id, concepto_id").limit(5000),
    supabase.from("conceptos").select("id, nombre").limit(5000),
  ]);
  // Conceptos comodín del sistema anterior ("?") no se sugieren
  const comodin = new Set(((kR.data ?? []) as { id: number; nombre: string }[]).filter((c) => ["?", "-", "SIN CONCEPTO"].includes(c.nombre.trim().toUpperCase())).map((c) => Number(c.id)));
  type P = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; razon_social: string | null; palabras_clave: string | null; concepto_id: number | null; activo: boolean };
  const proveedores: ProveedorCat[] = ((pR.data ?? []) as P[]).map((p) => ({
    id: Number(p.id),
    etiqueta: p.razon_social || [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(" "),
    palabras_clave: p.palabras_clave,
    concepto_id: p.concepto_id ? Number(p.concepto_id) : null,
    empresa: !p.apellido_paterno && !p.apellido_materno,
    activo: !!p.activo,
  }));
  const reglas = ((rR.data ?? []) as Regla[]).map((r) => ({
    ...r, proveedor_id: r.proveedor_id ? Number(r.proveedor_id) : null, concepto_id: r.concepto_id ? Number(r.concepto_id) : null,
  }));
  const conceptoHabitual = new Map(((cR.data ?? []) as { proveedor_id: number; concepto_id: number }[])
    .filter((c) => !comodin.has(Number(c.concepto_id)))
    .map((c) => [Number(c.proveedor_id), Number(c.concepto_id)]));
  return { reglas, proveedores, conceptoHabitual };
}

type Aprendible = { descripcion: string; contraparte: string | null; cargo: number; abono: number; proveedor_id: number | null; concepto_id: number | null };

/** Guarda (o actualiza) la regla de cada comercio con el "A favor de" y concepto con que se importó. */
export async function aprenderReglas(supabase: Supa, movs: Aprendible[]) {
  const porClave = new Map<string, { clave: string; tipo: "cargo" | "abono"; proveedor_id: number | null; concepto_id: number | null; n: number }>();
  for (const m of movs) {
    if (!m.proveedor_id && !m.concepto_id) continue;
    const clave = claveComercio(m);
    if (clave.length < 2 || clave.length > 120) continue;
    const tipo = tipoMovimiento(m);
    const k = `${tipo}|${clave}`;
    const v = porClave.get(k);
    porClave.set(k, { clave, tipo, proveedor_id: m.proveedor_id ?? v?.proveedor_id ?? null, concepto_id: m.concepto_id ?? v?.concepto_id ?? null, n: (v?.n ?? 0) + 1 });
  }
  if (!porClave.size) return;
  const claves = [...new Set([...porClave.values()].map((v) => v.clave))];
  const { data: existentes } = await supabase.from("reglas_clasificacion").select("id, clave, tipo, proveedor_id, concepto_id, usos").in("clave", claves);
  const nuevas = [];
  for (const v of porClave.values()) {
    const e = (existentes ?? []).find((x) => x.clave === v.clave && x.tipo === v.tipo);
    if (e) {
      await supabase.from("reglas_clasificacion").update({
        proveedor_id: v.proveedor_id ?? e.proveedor_id, concepto_id: v.concepto_id ?? e.concepto_id,
        usos: (e.usos ?? 0) + v.n, origen: "usuario", activa: true,
      }).eq("id", e.id);
    } else {
      nuevas.push({ clave: v.clave, tipo: v.tipo, proveedor_id: v.proveedor_id, concepto_id: v.concepto_id, usos: v.n, origen: "usuario" });
    }
  }
  if (nuevas.length) await supabase.from("reglas_clasificacion").insert(nuevas);
}
