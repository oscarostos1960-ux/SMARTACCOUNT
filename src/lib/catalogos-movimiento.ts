import type { SupabaseClient } from "@supabase/supabase-js";

// Listas de proveedores, conceptos y clasificaciones para filtros y captura de movimientos.
export async function cargarCatalogosMovimiento(supabase: SupabaseClient) {
  const [conceptosR, proveedoresR, clasifR] = await Promise.all([
    supabase.from("conceptos").select("id, nombre, activo").order("nombre").limit(5000),
    supabase.from("proveedores").select("id, nombre, apellido_paterno, apellido_materno, razon_social, activo").order("nombre").limit(5000),
    supabase.from("clasificaciones").select("id, nombre, color, activo").order("nombre"),
  ]);
  type Prov = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; razon_social: string | null; activo: boolean };
  const proveedores = ((proveedoresR.data ?? []) as Prov[]).map((p) => {
    const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(" ");
    return { valor: String(p.id), etiqueta: p.razon_social || nombre, activo: p.activo };
  }).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  const conceptos = ((conceptosR.data ?? []) as { id: number; nombre: string; activo: boolean }[]).map((c) => ({
    valor: String(c.id), etiqueta: c.nombre, activo: c.activo,
  }));
  const clasificaciones = (clasifR.data ?? []).map((c) => ({ id: Number(c.id), nombre: String(c.nombre), color: String(c.color), activo: !!c.activo }));
  return { conceptos, proveedores, clasificaciones };
}
