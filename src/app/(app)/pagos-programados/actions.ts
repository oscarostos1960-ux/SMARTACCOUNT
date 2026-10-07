"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { hoyCDMX } from "@/lib/formato";
import { FRECUENCIAS } from "@/lib/pagos";

export type ResultadoPago = {
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

function refrescar() {
  revalidatePath("/pagos-programados");
  revalidatePath("/");
}

async function esTitular() {
  const perfil = await obtenerPerfil();
  return perfil.rol === "titular";
}

export async function guardarPago(id: number | null, _prev: ResultadoPago, fd: FormData): Promise<ResultadoPago> {
  if (!(await esTitular())) return { error: "Solo el titular puede crear o cambiar pagos programados." };
  const valores = copiar(fd);
  const errores: Record<string, string> = {};

  const frecuencia = String(fd.get("frecuencia") ?? "");
  if (!FRECUENCIAS.some((f) => f.valor === frecuencia)) errores.frecuencia = "Elige cada cuándo se paga.";
  const inicio = texto(fd, "fecha_inicio", 10);
  if (!fechaValida(inicio)) errores.fecha_inicio = "Fecha no válida.";
  const fin = texto(fd, "fecha_fin", 10);
  if (fin && !fechaValida(fin)) errores.fecha_fin = "Fecha no válida.";
  else if (fin && inicio && fin < inicio) errores.fecha_fin = "Debe ser posterior a la primera fecha.";

  // Día del mes: por omisión, el de la primera fecha
  const diaInicio = inicio ? Number(inicio.slice(8, 10)) : 1;
  const dia1 = fd.get("dia1") ? Number(fd.get("dia1")) : diaInicio;
  const dia2 = fd.get("dia2") ? Number(fd.get("dia2")) : null;
  const diaValido = (d: number | null) => d !== null && Number.isInteger(d) && d >= 1 && d <= 31;
  let dias: number[] = [];
  if (frecuencia === "quincenal") {
    if (!diaValido(dia1)) errores.dia1 = "Día entre 1 y 31.";
    if (!diaValido(dia2)) errores.dia2 = "Día entre 1 y 31.";
    else if (dia2 === dia1) errores.dia2 = "Debe ser otro día.";
    dias = [dia1, dia2 ?? 0].sort((a, b) => a - b);
  } else if (frecuencia !== "unica" && frecuencia !== "semanal") {
    if (!diaValido(dia1)) errores.dia1 = "Día entre 1 y 31.";
    dias = [dia1];
  }
  const diaSemana = frecuencia === "semanal" && inicio ? ((new Date(`${inicio}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 : null;

  const tipo = fd.get("tipo");
  if (tipo !== "cargo" && tipo !== "abono") errores.tipo = "Elige cargo o abono.";
  const importe = fd.get("monto") ? monto(fd.get("monto")) : 0;
  if (!(importe >= 0)) errores.monto = "Escribe un importe válido (0 si varía).";
  const proveedor = idOpcional(fd, "proveedor_id");
  const concepto = idOpcional(fd, "concepto_id");
  const descripcion = texto(fd, "descripcion", 250);
  if (!proveedor && !concepto && !descripcion) errores.proveedor_id = "Elige a quién se paga o escribe la transacción.";
  if (Object.keys(errores).length) return { errores, valores, error: "Revisa los datos marcados." };

  const datos: Record<string, unknown> = {
    cuenta_id: idOpcional(fd, "cuenta_id"),
    proveedor_id: proveedor,
    concepto_id: concepto,
    descripcion: descripcion ?? "",
    cargo: tipo === "cargo" ? importe : 0,
    abono: tipo === "abono" ? importe : 0,
    referencia: texto(fd, "referencia", 100),
    leyenda1: texto(fd, "leyenda1", 255),
    leyenda2: texto(fd, "leyenda2", 255),
    leyenda3: texto(fd, "leyenda3", 500),
    observaciones: texto(fd, "observaciones", 2000),
    frecuencia,
    dias_mes: dias,
    dia_semana: diaSemana,
    fecha_inicio: inicio,
    fecha_fin: fin,
    avisar_whatsapp: fd.get("avisar_whatsapp") === "on",
    avisar_correo: fd.get("avisar_correo") === "on",
  };
  const clasificaciones = [...new Set(fd.getAll("clasificaciones").map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  const supabase = await createClient();
  let pagoId = id;
  if (id) {
    const { error } = await supabase.from("pagos_programados").update(datos).eq("id", id);
    if (error) return { valores, error: `No se pudo guardar (${error.message}).` };
    await supabase.from("pago_programado_clasificaciones").delete().eq("pago_id", id);
  } else {
    // Un pago nuevo no crea fechas atrasadas: empieza hoy o en su primera fecha.
    const hoy = hoyCDMX();
    datos.generar_desde = inicio! > hoy ? inicio : hoy;
    const { data, error } = await supabase.from("pagos_programados").insert(datos).select("id").single();
    if (error || !data) return { valores, error: `No se pudo guardar (${error?.message ?? "sin respuesta"}).` };
    pagoId = Number(data.id);
  }
  if (clasificaciones.length && pagoId) {
    const { error } = await supabase.from("pago_programado_clasificaciones")
      .insert(clasificaciones.map((c) => ({ pago_id: pagoId, clasificacion_id: c })));
    if (error) return { valores, error: `No se pudieron guardar las clasificaciones (${error.message}).` };
  }
  const { error: eGen } = id
    ? await supabase.rpc("regenerar_vencimientos", { p_pago: pagoId, p_desde: hoyCDMX() })
    : await supabase.rpc("generar_vencimientos", { p_pago: pagoId });
  if (eGen) return { valores, error: `Se guardó, pero no se pudieron calcular las fechas (${eGen.message}).` };

  refrescar();
  return { ok: true };
}

export async function cambiarActivo(id: number, activo: boolean): Promise<{ error?: string }> {
  if (!(await esTitular())) return { error: "Solo el titular puede cambiar pagos programados." };
  const supabase = await createClient();
  const { error } = await supabase.from("pagos_programados").update({ activo }).eq("id", id);
  if (error) return { error: error.message };
  if (activo) {
    await supabase.rpc("regenerar_vencimientos", { p_pago: id, p_desde: hoyCDMX() });
  } else {
    // Se quitan las fechas pendientes futuras; las vencidas y las pagadas se conservan.
    await supabase.from("vencimientos").delete().eq("pago_id", id).eq("estado", "pendiente").gte("fecha", hoyCDMX());
  }
  refrescar();
  return {};
}

export async function eliminarPago(id: number): Promise<{ error?: string }> {
  if (!(await esTitular())) return { error: "Solo el titular puede eliminar pagos programados." };
  const supabase = await createClient();
  const { error } = await supabase.from("pagos_programados").delete().eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return {};
}

// Cambios a una sola fecha: omitir, reactivar, desmarcar pago, mover fecha, otro importe, notas.
export async function actualizarVencimiento(
  id: number,
  cambios: { estado?: "pendiente" | "omitido"; fecha?: string; importe?: number | null; notas?: string | null },
): Promise<{ error?: string }> {
  const datos: Record<string, unknown> = {};
  if (cambios.estado) {
    datos.estado = cambios.estado;
    datos.transaccion_id = null;
    datos.pagado_en = null;
  }
  if (cambios.fecha !== undefined) {
    if (!fechaValida(cambios.fecha)) return { error: "Fecha no válida." };
    datos.fecha = cambios.fecha;
  }
  if (cambios.importe !== undefined) {
    if (cambios.importe !== null && !(cambios.importe >= 0)) return { error: "Importe no válido." };
    datos.importe = cambios.importe;
  }
  if (cambios.notas !== undefined) datos.notas = cambios.notas?.trim().slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("vencimientos").update(datos).eq("id", id).select("id");
  if (error) {
    if (error.code === "23505") return { error: "Ese pago ya tiene otra fecha programada en ese día." };
    return { error: error.message };
  }
  if (!data?.length) return { error: "No tienes permiso para cambiar este pago." };
  refrescar();
  return {};
}

// ---------- Historial del proveedor: prellenado y opciones para Transacción / Leyendas ----------
export type RegistroProveedor = {
  descripcion: string;
  leyenda1: string;
  leyenda2: string;
  leyenda3: string;
  veces: number;
  ultima: string;
};
export type HistorialProveedor = {
  ultimo: {
    fecha: string;
    cuenta_id: string;
    concepto_id: string;
    tipo: "cargo" | "abono";
    monto: string;
    descripcion: string;
    leyenda1: string;
    leyenda2: string;
    leyenda3: string;
    clasificaciones: string[];
  } | null;
  registros: RegistroProveedor[];
};

export async function historialProveedor(proveedorId: number): Promise<HistorialProveedor> {
  const vacio: HistorialProveedor = { ultimo: null, registros: [] };
  if (!Number.isInteger(proveedorId) || proveedorId <= 0) return vacio;
  const supabase = await createClient();
  // Solo lo capturado a mano o desde pagos programados: lo importado del banco trae textos largos del estado de cuenta
  const [{ data: movs }, { data: planes }] = await Promise.all([
    supabase.from("transacciones")
      .select("id, fecha, folio, cuenta_id, concepto_id, cargo, abono, descripcion, leyenda1, leyenda2, leyenda3")
      .eq("proveedor_id", proveedorId).is("importacion_id", null)
      .order("fecha", { ascending: false }).order("folio", { ascending: false }).limit(500),
    supabase.from("pagos_programados")
      .select("id, updated_at, cuenta_id, concepto_id, cargo, abono, descripcion, leyenda1, leyenda2, leyenda3")
      .eq("proveedor_id", proveedorId).order("updated_at", { ascending: false }).limit(50),
  ]);
  const limpio = (s: string | null) => (s ?? "").trim();
  const filas = [
    ...(movs ?? []).map((m) => ({ ...m, fecha: String(m.fecha), origen: "mov" as const })),
    ...(planes ?? []).map((p) => ({ ...p, fecha: String(p.updated_at).slice(0, 10), origen: "plan" as const })),
  ];
  if (!filas.length) return vacio;

  // Combinaciones usadas antes (sin repetir), las más usadas primero
  const mapa = new Map<string, RegistroProveedor>();
  for (const f of filas) {
    const r = { descripcion: limpio(f.descripcion), leyenda1: limpio(f.leyenda1), leyenda2: limpio(f.leyenda2), leyenda3: limpio(f.leyenda3) };
    if (!r.descripcion && !r.leyenda1 && !r.leyenda2 && !r.leyenda3) continue;
    const k = [r.descripcion, r.leyenda1, r.leyenda2, r.leyenda3].join("\u0001").toUpperCase();
    const prev = mapa.get(k);
    if (prev) { prev.veces++; if (f.fecha > prev.ultima) prev.ultima = f.fecha; }
    else mapa.set(k, { ...r, veces: 1, ultima: f.fecha });
  }
  const registros = [...mapa.values()]
    .sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima))
    .slice(0, 200);

  // El último pago: el movimiento más reciente; si no hay, el pago programado más reciente
  const mov = (movs ?? [])[0];
  const plan = (planes ?? [])[0];
  const u = mov ?? plan;
  let clasificaciones: string[] = [];
  if (mov) {
    const { data: cl } = await supabase.from("transaccion_clasificaciones").select("clasificacion_id").eq("transaccion_id", mov.id);
    clasificaciones = (cl ?? []).map((c) => String(c.clasificacion_id));
  } else if (plan) {
    const { data: cl } = await supabase.from("pago_programado_clasificaciones").select("clasificacion_id").eq("pago_id", plan.id);
    clasificaciones = (cl ?? []).map((c) => String(c.clasificacion_id));
  }
  const abono = Number(u.abono) > Number(u.cargo);
  const importe = Math.abs(Number(u.abono) - Number(u.cargo));
  return {
    ultimo: {
      fecha: mov ? String(mov.fecha) : String(plan.updated_at).slice(0, 10),
      cuenta_id: u.cuenta_id ? String(u.cuenta_id) : "",
      concepto_id: u.concepto_id ? String(u.concepto_id) : "",
      tipo: abono ? "abono" : "cargo",
      monto: importe ? String(importe) : "",
      descripcion: limpio(u.descripcion),
      leyenda1: limpio(u.leyenda1),
      leyenda2: limpio(u.leyenda2),
      leyenda3: limpio(u.leyenda3),
      clasificaciones,
    },
    registros,
  };
}
