"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";

// Alta rápida de catálogos desde la captura o el importador (sin salir de la pantalla).
// Solo el titular puede dar de alta; si ya existe uno con el mismo nombre, se regresa ese.

type Resultado = { valor?: string; etiqueta?: string; color?: string; existia?: boolean; error?: string };

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 120);
// Para buscar el nombre exacto con ilike (sin que % o _ funcionen como comodines)
const exacto = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

async function preparar(texto: string) {
  const permisos = await obtenerPermisos();
  if (!permisos.esTitular) return { error: "Solo el titular puede dar de alta en los catálogos." } as const;
  const nombre = limpiar(texto);
  if (nombre.length < 2) return { error: "Escribe al menos 2 letras." } as const;
  return { nombre, supabase: await createClient() } as const;
}

export async function crearProveedorRapido(texto: string): Promise<Resultado> {
  const p = await preparar(texto);
  if ("error" in p) return { error: p.error };
  const { nombre, supabase } = p;
  for (const campo of ["razon_social", "nombre"]) {
    const { data } = await supabase.from("proveedores").select("id, nombre, razon_social").ilike(campo, exacto(nombre)).limit(1);
    if (data?.[0]) return { valor: String(data[0].id), etiqueta: data[0].razon_social || data[0].nombre, existia: true };
  }
  // Como "A favor de" se muestra por razón social, se guarda en los dos campos
  const { data, error } = await supabase.from("proveedores").insert({ nombre, razon_social: nombre }).select("id").single();
  if (error || !data) return { error: `No se pudo dar de alta (${error?.message ?? "sin respuesta"}).` };
  revalidatePath("/catalogos/proveedores");
  return { valor: String(data.id), etiqueta: nombre };
}

export async function crearConceptoRapido(texto: string): Promise<Resultado> {
  const p = await preparar(texto);
  if ("error" in p) return { error: p.error };
  const { nombre, supabase } = p;
  const { data: ya } = await supabase.from("conceptos").select("id, nombre, activo").ilike("nombre", exacto(nombre)).limit(1);
  if (ya?.[0]) {
    if (!ya[0].activo) await supabase.from("conceptos").update({ activo: true }).eq("id", ya[0].id);
    return { valor: String(ya[0].id), etiqueta: ya[0].nombre, existia: true };
  }
  const { data, error } = await supabase.from("conceptos").insert({ nombre }).select("id").single();
  if (error || !data) return { error: `No se pudo dar de alta (${error?.message ?? "sin respuesta"}).` };
  revalidatePath("/catalogos/conceptos");
  return { valor: String(data.id), etiqueta: nombre };
}

const COLORES = ["#2563EB", "#16A34A", "#DC2626", "#9333EA", "#EA580C", "#0891B2", "#CA8A04", "#DB2777", "#4B5563"];

export async function crearClasificacionRapida(texto: string): Promise<Resultado> {
  const p = await preparar(texto);
  if ("error" in p) return { error: p.error };
  const { nombre, supabase } = p;
  const { data: ya } = await supabase.from("clasificaciones").select("id, nombre, color, activo").ilike("nombre", exacto(nombre)).limit(1);
  if (ya?.[0]) {
    if (!ya[0].activo) await supabase.from("clasificaciones").update({ activo: true }).eq("id", ya[0].id);
    return { valor: String(ya[0].id), etiqueta: ya[0].nombre, color: ya[0].color, existia: true };
  }
  const { data: todas } = await supabase.from("clasificaciones").select("id").limit(1000);
  const color = COLORES[(todas?.length ?? 0) % COLORES.length];
  const { data, error } = await supabase.from("clasificaciones").insert({ nombre, color }).select("id").single();
  if (error || !data) return { error: `No se pudo dar de alta (${error?.message ?? "sin respuesta"}).` };
  revalidatePath("/catalogos/clasificaciones");
  return { valor: String(data.id), etiqueta: nombre, color };
}
