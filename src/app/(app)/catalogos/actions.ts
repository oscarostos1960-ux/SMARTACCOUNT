"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirTitular } from "@/lib/auth";
import { obtenerCatalogo, type Campo } from "@/lib/catalogos";

export type ResultadoGuardar = {
  ok?: boolean;
  error?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string | boolean>; // lo capturado, para no perderlo si hay error
};

type Valor = string | number | boolean | null;

// Convierte y valida un campo del formulario. Regresa [valor, error].
function procesarCampo(campo: Campo, bruto: FormDataEntryValue | null): [Valor, string | undefined] {
  if (campo.tipo === "booleano") return [bruto === "on" || bruto === "true", undefined];

  const texto = String(bruto ?? "").trim();
  if (texto === "") return campo.requerido ? [null, "Este dato es obligatorio."] : [null, undefined];

  switch (campo.tipo) {
    case "correo":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto) ? [texto.toLowerCase(), undefined] : [null, "Correo no válido."];
    case "celular": {
      const d = texto.replace(/\D/g, "").replace(/^(52|521)(?=\d{10}$)/, "");
      return /^\d{10}$/.test(d) ? [d, undefined] : [null, "Escribe 10 dígitos."];
    }
    case "rfc": {
      const r = texto.toUpperCase().replace(/[\s-]/g, "");
      return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(r) ? [r, undefined] : [null, "RFC no válido."];
    }
    case "terminacion":
      return /^\d{4}$/.test(texto) ? [texto, undefined] : [null, "Deben ser 4 dígitos."];
    case "codigo": {
      const c = texto.toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? [c, undefined] : [null, "Deben ser 3 letras."];
    }
    case "color":
      return /^#[0-9A-Fa-f]{6}$/.test(texto) ? [texto.toUpperCase(), undefined] : [null, "Color no válido."];
    case "dinero":
    case "decimal": {
      const n = Number(texto.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n)) return [null, "Número no válido."];
      if (campo.tipo === "decimal" && n <= 0) return [null, "Debe ser mayor a cero."];
      return [n, undefined];
    }
    case "referencia": {
      const n = Number(texto);
      return Number.isInteger(n) && n > 0 ? [n, undefined] : [null, "Selección no válida."];
    }
    case "opciones":
      return campo.opciones?.some((o) => o.valor === texto) ? [texto, undefined] : [null, "Opción no válida."];
    default:
      return [texto.slice(0, 2000), undefined];
  }
}

function mensajeDeError(codigo: string | undefined, mensaje: string) {
  if (codigo === "23505") return "Ya existe un registro con ese nombre.";
  if (codigo === "23503") return "No se puede: este registro está en uso.";
  if (codigo === "23514") return "Algún dato no tiene el formato correcto.";
  if (codigo === "42501") return "No tienes permiso para hacer cambios.";
  return `No se pudo guardar (${mensaje}).`;
}

export async function guardarRegistro(
  clave: string,
  id: number | null,
  _prev: ResultadoGuardar,
  formData: FormData,
): Promise<ResultadoGuardar> {
  try {
    await exigirTitular();
  } catch {
    return { error: "Solo el titular puede hacer cambios." };
  }
  const catalogo = obtenerCatalogo(clave);
  if (!catalogo) return { error: "Catálogo no encontrado." };

  const datos: Record<string, Valor> = {};
  const errores: Record<string, string> = {};
  const valores: Record<string, string | boolean> = {};
  for (const campo of catalogo.campos) {
    valores[campo.nombre] = campo.tipo === "booleano" ? formData.get(campo.nombre) === "on" : String(formData.get(campo.nombre) ?? "");
  }
  for (const campo of catalogo.campos) {
    const [valor, error] = procesarCampo(campo, formData.get(campo.nombre));
    if (error) errores[campo.nombre] = error;
    else datos[campo.nombre] = valor;
  }
  datos[catalogo.campoActivo] = formData.get(catalogo.campoActivo) === "on";
  if (Object.keys(errores).length) return { errores, valores, error: "Revisa los datos marcados." };

  const supabase = await createClient();
  const consulta = id
    ? supabase.from(catalogo.tabla).update(datos).eq("id", id)
    : supabase.from(catalogo.tabla).insert(datos);
  const { error } = await consulta;
  if (error) return { valores, error: mensajeDeError(error.code, error.message) };

  revalidatePath(`/catalogos/${clave}`);
  return { ok: true };
}

export async function cambiarActivo(clave: string, id: number, activo: boolean) {
  await exigirTitular();
  const catalogo = obtenerCatalogo(clave);
  if (!catalogo) throw new Error("Catálogo no encontrado.");
  const supabase = await createClient();
  const { error } = await supabase.from(catalogo.tabla).update({ [catalogo.campoActivo]: activo }).eq("id", id);
  if (error) throw new Error(mensajeDeError(error.code, error.message));
  revalidatePath(`/catalogos/${clave}`);
}
