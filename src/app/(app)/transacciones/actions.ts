"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirTitular } from "@/lib/auth";

export type ResultadoMovimiento = {
  ok?: boolean;
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
    if (k.startsWith("$")) continue;
    const todos = fd.getAll(k).map(String);
    valores[k] = k === "clasificaciones" ? todos : todos[0];
  }
  return valores;
}

function mensaje(codigo: string | undefined, msg: string) {
  if (codigo === "42501") return "No tienes permiso para hacer cambios.";
  if (codigo === "23503") return "Algún dato seleccionado ya no existe.";
  if (codigo === "23514") return "Algún dato no tiene el formato correcto.";
  return `No se pudo guardar (${msg}).`;
}

export async function guardarMovimiento(
  cuentaId: number,
  id: number | null,
  _prev: ResultadoMovimiento,
  fd: FormData,
): Promise<ResultadoMovimiento> {
  try {
    await exigirTitular();
  } catch {
    return { error: "Solo el titular puede registrar movimientos." };
  }
  const valores = copiar(fd);
  const errores: Record<string, string> = {};

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
  if (!descripcion && !concepto && !proveedor) errores.descripcion = "Escribe una descripción o elige un concepto.";
  if (Object.keys(errores).length) return { errores, valores, error: "Revisa los datos marcados." };

  const datos = {
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
  const clasificaciones = [...new Set(fd.getAll("clasificaciones").map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  const supabase = await createClient();
  let movimientoId = id;
  if (id) {
    const { error } = await supabase.from("transacciones").update(datos).eq("id", id).eq("cuenta_id", cuentaId);
    if (error) return { valores, error: mensaje(error.code, error.message) };
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

  revalidatePath("/transacciones", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function guardarTransferencia(
  origen: number,
  _prev: ResultadoMovimiento,
  fd: FormData,
): Promise<ResultadoMovimiento> {
  try {
    await exigirTitular();
  } catch {
    return { error: "Solo el titular puede registrar movimientos." };
  }
  const valores = copiar(fd);
  const errores: Record<string, string> = {};
  const destino = idOpcional(fd, "destino");
  if (!destino) errores.destino = "Elige la cuenta destino.";
  else if (destino === origen) errores.destino = "Debe ser otra cuenta.";
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
  revalidatePath("/transacciones", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function eliminarMovimiento(id: number): Promise<{ error?: string }> {
  try {
    await exigirTitular();
  } catch {
    return { error: "Solo el titular puede eliminar movimientos." };
  }
  const supabase = await createClient();
  const { data: mov } = await supabase.from("transacciones").select("id, transferencia_id").eq("id", id).single();
  if (!mov) return { error: "El movimiento ya no existe." };
  const consulta = mov.transferencia_id
    ? supabase.from("transacciones").delete().eq("transferencia_id", mov.transferencia_id)
    : supabase.from("transacciones").delete().eq("id", id);
  const { error } = await consulta;
  if (error) return { error: mensaje(error.code, error.message) };
  revalidatePath("/transacciones", "layout");
  revalidatePath("/");
  return {};
}
