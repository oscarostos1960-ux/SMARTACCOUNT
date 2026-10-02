"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { leerArchivo } from "@/lib/importador/leer";
import { armarFilas, ocultarTarjetas, type Existente, type Historico } from "@/lib/importador/analisis";
import { esquemaEstado, type Analisis, type EstadoIA } from "@/lib/importador/esquema";

type Supa = Awaited<ReturnType<typeof createClient>>;

const restarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// Arma la vista previa para una cuenta: duplicados, sugerencias y cuadre.
async function construirAnalisis(supabase: Supa, imp: {
  id: number; archivo_nombre: string; archivo_tipo: "pdf" | "xml"; estado: string; datos: EstadoIA; archivo_huella: string | null;
}, cuentaId: number | null, detectada: boolean): Promise<Analisis> {
  const datos = imp.datos;
  const fechas = datos.movimientos.map((m) => m.fecha).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
  const desde = restarDias(datos.periodo_inicio ?? fechas[0] ?? "2000-01-01", 5);
  const hasta = restarDias(datos.periodo_fin ?? fechas.at(-1) ?? "2100-01-01", -5);

  let existentes: Existente[] = [];
  let historial: Historico[] = [];
  if (cuentaId) {
    const [exR, histR] = await Promise.all([
      supabase.from("transacciones").select("id, folio, fecha, cargo, abono").eq("cuenta_id", cuentaId)
        .gte("fecha", desde).lte("fecha", hasta).order("fecha").limit(1000),
      supabase.from("transacciones").select("descripcion, leyenda1, leyenda2, leyenda3, proveedor_id, concepto_id")
        .eq("cuenta_id", cuentaId).order("fecha", { ascending: false }).limit(1000),
    ]);
    existentes = (exR.data ?? []).map((e) => ({ id: Number(e.id), folio: Number(e.folio), fecha: String(e.fecha), cargo: Number(e.cargo), abono: Number(e.abono) }));
    historial = (histR.data ?? []).filter((h) => h.proveedor_id || h.concepto_id)
      .map((h) => ({ texto: [h.descripcion, h.leyenda1, h.leyenda2, h.leyenda3].filter(Boolean).join(" "), proveedor_id: h.proveedor_id, concepto_id: h.concepto_id }));
  }
  // Si la cuenta tiene poca historia, también se aprende de las demás cuentas
  if (historial.length < 200) {
    const { data } = await supabase.from("transacciones").select("descripcion, leyenda1, leyenda2, leyenda3, proveedor_id, concepto_id")
      .order("fecha", { ascending: false }).limit(1000);
    historial = historial.concat((data ?? []).filter((h) => h.proveedor_id || h.concepto_id)
      .map((h) => ({ texto: [h.descripcion, h.leyenda1, h.leyenda2, h.leyenda3].filter(Boolean).join(" "), proveedor_id: h.proveedor_id, concepto_id: h.concepto_id })));
  }

  const { filas, cuadre } = armarFilas(datos, existentes, historial);
  let yaImportado: string | undefined;
  if (imp.archivo_huella) {
    const { data } = await supabase.from("importaciones").select("id, created_at, movimientos_importados")
      .eq("archivo_huella", imp.archivo_huella).eq("estado", "importado").neq("id", imp.id).limit(1);
    if (data?.length) yaImportado = `Este mismo archivo ya se importó el ${new Date(data[0].created_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })} (${data[0].movimientos_importados} movimientos).`;
  }
  const { movimientos: _m, ...resto } = datos;
  void _m;
  return {
    importacionId: imp.id, archivoNombre: imp.archivo_nombre, archivoTipo: imp.archivo_tipo, estado: imp.estado,
    datos: resto, cuentaId, cuentaDetectada: detectada, filas, cuadre, yaImportado,
  };
}

// 1) Lee el archivo ya subido al bucket "estados" con la IA y regresa la vista previa.
export async function analizarArchivo(ruta: string, nombre: string, tipo: "pdf" | "xml", huella: string | null): Promise<{ analisis?: Analisis; error?: string }> {
  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  const r = await leerArchivo(supabase, permisos, ruta, nombre, tipo, huella);
  revalidatePath("/importar");
  if ("error" in r) return { error: r.error };
  const analisis = await construirAnalisis(supabase, {
    id: r.id, archivo_nombre: nombre, archivo_tipo: tipo, estado: "leido", datos: r.datos, archivo_huella: huella,
  }, r.cuentaId, r.cuentaId !== null);
  return { analisis };
}

// 2) Vuelve a abrir una lectura (o cambia de cuenta) sin volver a usar la IA.
export async function abrirImportacion(id: number, cuentaId?: number | null): Promise<{ analisis?: Analisis; error?: string }> {
  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  const { data: imp } = await supabase.from("importaciones").select("id, archivo_nombre, archivo_tipo, estado, datos, cuenta_id, archivo_huella").eq("id", id).maybeSingle();
  if (!imp || !imp.datos) return { error: "No se encontró la lectura del estado de cuenta." };
  const parsed = esquemaEstado.safeParse(imp.datos);
  if (!parsed.success) return { error: "La lectura guardada no es válida." };
  const elegida = cuentaId === undefined ? (imp.cuenta_id ? Number(imp.cuenta_id) : null) : cuentaId;
  if (elegida && !permisos.puedeEditar(elegida)) return { error: "No tienes permiso para capturar en esa cuenta." };
  // Recordar la cuenta elegida para que al "Continuar" después siga seleccionada
  if (cuentaId !== undefined && imp.estado === "leido") {
    await supabase.from("importaciones").update({ cuenta_id: cuentaId }).eq("id", id);
  }
  const analisis = await construirAnalisis(supabase, { ...imp, id: Number(imp.id), datos: parsed.data } as never, elegida, cuentaId === undefined && !!imp.cuenta_id);
  return { analisis };
}

export type FilaAImportar = {
  fecha: string; descripcion: string; detalle: string; contraparte: string | null; referencia: string | null;
  cargo: number; abono: number; proveedor_id: string; concepto_id: string;
};

// 3) Crea los movimientos elegidos en la cuenta, con folios consecutivos.
export async function importarMovimientos(id: number, cuentaId: number, filas: FilaAImportar[]): Promise<{ ok?: boolean; error?: string; importados?: number }> {
  const permisos = await obtenerPermisos();
  if (!permisos.puedeEditar(cuentaId)) return { error: "No tienes permiso para capturar en esa cuenta." };
  if (!filas.length) return { error: "No elegiste ningún movimiento." };
  const supabase = await createClient();
  const { data: imp } = await supabase.from("importaciones").select("id, estado, terminacion").eq("id", id).maybeSingle();
  if (!imp) return { error: "No se encontró la lectura del estado de cuenta." };
  if (imp.estado === "importado") return { error: "Este estado de cuenta ya se importó." };

  const fechaOk = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));
  const num = (n: unknown) => Math.round(Math.max(0, Number(n) || 0) * 100) / 100;
  const idOpc = (v: string) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  // Los movimientos en $0 (p. ej. exenciones de comisión) sí se permiten; solo la fecha es obligatoria.
  const malas = filas.filter((f) => !fechaOk(f.fecha));
  if (malas.length) return { error: `Revisa ${malas.length} movimiento(s): falta la fecha o no es válida.` };
  if (filas.some((f) => num(f.cargo) > 0 && num(f.abono) > 0)) return { error: "Un movimiento no puede tener cargo y abono a la vez." };

  // Del más antiguo al más reciente (respetando el orden del estado de cuenta)
  const ordenadas = filas.map((f, i) => ({ f, i })).sort((a, b) => a.f.fecha.localeCompare(b.f.fecha) || a.i - b.i).map((x) => x.f);
  const registros = ordenadas.map((f) => ({
    cuenta_id: cuentaId,
    fecha: f.fecha,
    cargo: num(f.cargo),
    abono: num(f.abono),
    descripcion: (ocultarTarjetas(f.descripcion) ?? "").slice(0, 250),
    leyenda1: ocultarTarjetas(f.contraparte)?.slice(0, 255) || null,
    leyenda2: ocultarTarjetas(f.detalle)?.slice(0, 500) || null,
    referencia: ocultarTarjetas(f.referencia)?.slice(0, 100) || null,
    proveedor_id: idOpc(f.proveedor_id),
    concepto_id: idOpc(f.concepto_id),
    importacion_id: id,
  }));
  // De a uno por uno para que cada movimiento tome el siguiente folio de la cuenta
  let importados = 0;
  for (const r of registros) {
    const { error } = await supabase.from("transacciones").insert(r);
    if (error) {
      await supabase.from("importaciones").update({ movimientos_importados: importados, cuenta_id: cuentaId, estado: importados ? "importado" : "leido" }).eq("id", id);
      return { error: `Se importaron ${importados} de ${registros.length}; falló uno (${error.message}).`, importados };
    }
    importados++;
  }
  await supabase.from("importaciones").update({ estado: "importado", cuenta_id: cuentaId, movimientos_importados: importados }).eq("id", id);
  // La cuenta "aprende" su terminación para reconocerla sola la próxima vez
  if (imp.terminacion && permisos.esTitular) {
    await supabase.from("cuentas").update({ terminacion: imp.terminacion }).eq("id", cuentaId).is("terminacion", null);
  }
  revalidatePath("/importar");
  revalidatePath("/transacciones", "layout");
  revalidatePath("/");
  return { ok: true, importados };
}

export async function descartarImportacion(id: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("importaciones").update({ estado: "descartado" }).eq("id", id).neq("estado", "importado");
  if (error) return { error: error.message };
  revalidatePath("/importar");
  return {};
}
