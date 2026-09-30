"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";

export type ResultadoMovimiento = {
  ok?: boolean;
  id?: number;                 // id del movimiento guardado (para subir documentos después)
  error?: string;
  errores?: Record<string, string>;
  valores?: Record<string, string | string[]>;
};

const texto = (fd: FormData, k: string, max = 500) => {
  const v = String(fd.get(k) ?? "").trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
};
const idOpcional = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const monto = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const fechaValida = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

function copiar(fd: FormData) {
  const valores: Record<string, string | string[]> = {};
  for (const k of new Set(fd.keys())) {
    if (k.startsWith("$") || k === "archivos") continue;
    const todos = fd.getAll(k).map(String);
    valores[k] = k === "clasificaciones" ? todos : todos[0];
  }
  return valores;
}

function mensaje(codigo: string | undefined, msg: string) {
  if (codigo === "42501") return "No tienes permiso para hacer cambios en esta cuenta.";
  if (codigo === "23503") return "Algún dato seleccionado ya no existe.";
  if (codigo === "23514") return "Algún dato no tiene el formato correcto.";
  return `No se pudo guardar (${msg}).`;
}

function refrescar() {
  revalidatePath("/transacciones", "layout");
  revalidatePath("/reporte");
  revalidatePath("/");
}

export async function guardarMovimiento(
  cuentaId: number,
  id: number | null,
  _prev: ResultadoMovimiento,
  fd: FormData,
): Promise<ResultadoMovimiento> {
  const permisos = await obtenerPermisos();
  if (!permisos.puedeEditar(cuentaId)) return { error: "No tienes permiso para registrar movimientos en esta cuenta." };

  const valores = copiar(fd);
  const errores: Record<string, string> = {};

  const folioTexto = texto(fd, "folio", 10);
  const folio = folioTexto === null ? null : Number(folioTexto);
  if (folio !== null && !(Number.isInteger(folio) && folio >= 0)) errores.folio = "Escribe un número entero.";
  const fecha = texto(fd, "fecha", 10);
  if (!fechaValida(fecha)) errores.fecha = "Fecha no válida.";
  const tipo = fd.get("tipo");
  if (tipo !== "cargo" && tipo !== "abono") errores.tipo = "Elige cargo o abono.";
  const importe = monto(fd.get("monto"));
  if (!(importe > 0)) errores.monto = "Escribe un importe mayor a cero.";
  const tc = fd.get("tipo_cambio") ? monto(fd.get("tipo_cambio")) : 1;
  if (!(tc > 0)) errores.tipo_cambio = "Debe ser mayor a cero.";
  const descripcion = texto(fd, "descripcion", 250);
  const concepto = idOpcional(fd, "concepto_id");
  const proveedor = idOpcional(fd, "proveedor_id");
  if (!descripcion && !concepto && !proveedor) errores.descripcion = "Escribe la transacción o elige un concepto o proveedor.";
  if (Object.keys(errores).length) return { errores, valores, error: "Revisa los datos marcados." };

  const datos: Record<string, unknown> = {
    cuenta_id: cuentaId,
    fecha,
    cargo: tipo === "cargo" ? importe : 0,
    abono: tipo === "abono" ? importe : 0,
    tipo_cambio: tc,
    descripcion: descripcion ?? "",
    concepto_id: concepto,
    proveedor_id: proveedor,
    referencia: texto(fd, "referencia", 100),
    leyenda1: texto(fd, "leyenda1", 255),
    leyenda2: texto(fd, "leyenda2", 255),
    leyenda3: texto(fd, "leyenda3", 500),
    observaciones: texto(fd, "observaciones", 2000),
  };
  if (folio !== null) datos.folio = folio;
  const clasificaciones = [...new Set(fd.getAll("clasificaciones").map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  const supabase = await createClient();
  let movimientoId = id;
  if (id) {
    const { data, error } = await supabase.from("transacciones").update(datos).eq("id", id).eq("cuenta_id", cuentaId).select("id");
    if (error) return { valores, error: mensaje(error.code, error.message) };
    if (!data?.length) return { valores, error: "No se encontró el movimiento o no tienes permiso para cambiarlo." };
    const { error: e2 } = await supabase.from("transaccion_clasificaciones").delete().eq("transaccion_id", id);
    if (e2) return { valores, error: mensaje(e2.code, e2.message) };
  } else {
    const { data, error } = await supabase.from("transacciones").insert(datos).select("id").single();
    if (error || !data) return { valores, error: mensaje(error?.code, error?.message ?? "sin respuesta") };
    movimientoId = data.id as number;
  }
  if (clasificaciones.length && movimientoId) {
    const { error } = await supabase
      .from("transaccion_clasificaciones")
      .insert(clasificaciones.map((c) => ({ transaccion_id: movimientoId, clasificacion_id: c })));
    if (error) return { valores, error: mensaje(error.code, error.message) };
  }

  refrescar();
  return { ok: true, id: movimientoId ?? undefined };
}

export async function guardarTransferencia(
  origen: number,
  _prev: ResultadoMovimiento,
  fd: FormData,
): Promise<ResultadoMovimiento> {
  const permisos = await obtenerPermisos();
  const valores = copiar(fd);
  const errores: Record<string, string> = {};
  const destino = idOpcional(fd, "destino");
  if (!destino) errores.destino = "Elige la cuenta destino.";
  else if (destino === origen) errores.destino = "Debe ser otra cuenta.";
  else if (!permisos.puedeEditar(destino)) errores.destino = "No tienes permiso para registrar en esa cuenta.";
  if (!permisos.puedeEditar(origen)) return { valores, error: "No tienes permiso para registrar movimientos en esta cuenta." };
  const fecha = texto(fd, "fecha", 10);
  if (!fechaValida(fecha)) errores.fecha = "Fecha no válida.";
  const importe = monto(fd.get("monto"));
  if (!(importe > 0)) errores.monto = "Escribe un importe mayor a cero.";
  const importeDestino = fd.get("monto_destino") ? monto(fd.get("monto_destino")) : null;
  if (importeDestino !== null && !(importeDestino > 0)) errores.monto_destino = "Debe ser mayor a cero.";
  if (Object.keys(errores).length) return { errores, valores, error: "Revisa los datos marcados." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_transferencia", {
    p_origen: origen,
    p_destino: destino,
    p_fecha: fecha,
    p_monto: importe,
    p_monto_destino: importeDestino,
    p_descripcion: texto(fd, "descripcion", 250) ?? "TRANSFERENCIA",
    p_concepto_id: idOpcional(fd, "concepto_id"),
    p_observaciones: texto(fd, "observaciones", 2000),
  });
  if (error) return { valores, error: mensaje(error.code, error.message) };
  refrescar();
  return { ok: true };
}

export async function eliminarMovimiento(id: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: mov } = await supabase.from("transacciones").select("id, cuenta_id, transferencia_id").eq("id", id).single();
  if (!mov) return { error: "El movimiento ya no existe." };
  const permisos = await obtenerPermisos();
  if (!permisos.puedeEditar(Number(mov.cuenta_id))) return { error: "No tienes permiso para eliminar movimientos en esta cuenta." };

  // Primero los archivos adjuntos (los registros se borran junto con el movimiento)
  const ids = mov.transferencia_id
    ? ((await supabase.from("transacciones").select("id").eq("transferencia_id", mov.transferencia_id)).data ?? []).map((t) => t.id)
    : [id];
  const { data: docs } = await supabase.from("documentos").select("ruta").in("transaccion_id", ids);
  if (docs?.length) await supabase.storage.from("documentos").remove(docs.map((d) => d.ruta as string));

  const consulta = mov.transferencia_id
    ? supabase.from("transacciones").delete().eq("transferencia_id", mov.transferencia_id)
    : supabase.from("transacciones").delete().eq("id", id);
  const { error } = await consulta;
  if (error) return { error: mensaje(error.code, error.message) };
  refrescar();
  return {};
}

// ---------- Prellenado: datos del último movimiento con ese proveedor ----------
export type Plantilla = {
  tipo: "cargo" | "abono";
  monto: string;
  descripcion: string;
  concepto_id: string;
  referencia: string;
  leyenda1: string;
  leyenda2: string;
  leyenda3: string;
  observaciones: string;
  clasificaciones: string[];
  folio_origen: number;
  fecha_origen: string;
  cuenta_origen: string;
};

export async function ultimoMovimientoProveedor(proveedorId: number, cuentaId: number): Promise<Plantilla | null> {
  if (!Number.isInteger(proveedorId) || proveedorId <= 0) return null;
  const supabase = await createClient();
  const columnas = "id, cuenta_id, cuenta, folio, fecha, cargo, abono, descripcion, concepto_id, referencia, leyenda1, leyenda2, leyenda3, observaciones, clasificaciones";
  // Primero en la misma cuenta; si no hay, en cualquier cuenta visible
  let { data } = await supabase.from("v_transacciones").select(columnas)
    .eq("proveedor_id", proveedorId).eq("cuenta_id", cuentaId)
    .order("fecha", { ascending: false }).order("folio", { ascending: false }).limit(1);
  if (!data?.length) {
    ({ data } = await supabase.from("v_transacciones").select(columnas)
      .eq("proveedor_id", proveedorId)
      .order("fecha", { ascending: false }).order("folio", { ascending: false }).limit(1));
  }
  const m = data?.[0];
  if (!m) return null;
  const abono = Number(m.abono) > Number(m.cargo);
  return {
    tipo: abono ? "abono" : "cargo",
    monto: String(Math.abs(Number(m.abono) - Number(m.cargo)) || Number(m.cargo) || Number(m.abono) || ""),
    descripcion: m.descripcion ?? "",
    concepto_id: m.concepto_id ? String(m.concepto_id) : "",
    referencia: "",
    leyenda1: m.leyenda1 ?? "",
    leyenda2: m.leyenda2 ?? "",
    leyenda3: m.leyenda3 ?? "",
    observaciones: m.observaciones ?? "",
    clasificaciones: ((m.clasificaciones ?? []) as number[]).map(String),
    folio_origen: Number(m.folio),
    fecha_origen: String(m.fecha),
    cuenta_origen: String(m.cuenta),
  };
}

// ---------- Documentos adjuntos ----------
export type Documento = { id: number; nombre: string; tipo: string | null; tamano: number | null; url: string | null; created_at: string };

export async function listarDocumentos(transaccionId: number): Promise<Documento[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("documentos").select("id, nombre, ruta, tipo, tamano, created_at")
    .eq("transaccion_id", transaccionId).order("created_at");
  if (!data?.length) return [];
  const { data: firmadas } = await supabase.storage.from("documentos").createSignedUrls(data.map((d) => d.ruta as string), 60 * 60);
  const urls = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  return data.map((d) => ({
    id: Number(d.id), nombre: String(d.nombre), tipo: d.tipo as string | null, tamano: d.tamano as number | null,
    url: urls.get(d.ruta as string) ?? null, created_at: String(d.created_at),
  }));
}

// El archivo ya se subió desde el navegador a Storage; aquí solo se registra.
export async function registrarDocumento(transaccionId: number, nombre: string, ruta: string, tipo: string, tamano: number) {
  const supabase = await createClient();
  const { data: mov } = await supabase.from("transacciones").select("cuenta_id").eq("id", transaccionId).single();
  if (!mov || !ruta.startsWith(`${mov.cuenta_id}/${transaccionId}/`)) return { error: "Documento no válido." };
  const { error } = await supabase.from("documentos").insert({
    transaccion_id: transaccionId, nombre: nombre.slice(0, 250), ruta, tipo: tipo.slice(0, 100) || null, tamano,
  });
  if (error) {
    await supabase.storage.from("documentos").remove([ruta]);
    return { error: mensaje(error.code, error.message) };
  }
  refrescar();
  return {};
}

export async function eliminarDocumento(id: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documentos").select("id, ruta").eq("id", id).single();
  if (!doc) return { error: "El documento ya no existe." };
  const { data, error } = await supabase.from("documentos").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "No tienes permiso para eliminar este documento." };
  await supabase.storage.from("documentos").remove([doc.ruta as string]);
  refrescar();
  return {};
}
