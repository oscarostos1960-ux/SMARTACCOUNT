import "server-only";
import { createClient } from "@/lib/supabase/server";
import { obtenerEspacio, obtenerPermisos } from "@/lib/auth";
import { leerSecreto } from "@/lib/secretos";
import { leerEstadoConIA } from "./ia";
import { completarCargosDelResumen, corregirCargoYAbono, cuadrar, fecharMensualidades, quitarCargosDelResumenRepetidos, quitarMensualidadesSobrantes } from "./analisis";
import type { EstadoIA, ResumenLectura } from "./esquema";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Permisos = Awaited<ReturnType<typeof obtenerPermisos>>;

// Registra el archivo ya subido al bucket "estados", lo lee con la IA y detecta la cuenta.
export async function leerArchivo(
  supabase: Supa, permisos: Permisos, ruta: string, nombre: string, tipo: "pdf" | "xml", huella: string | null,
): Promise<{ error: string; id?: number } | { id: number; datos: EstadoIA; cuentaId: number | null }> {
  if (!permisos.algunaEditable) return { error: "No tienes permiso para importar movimientos." };
  if (!ruta.startsWith(`${permisos.perfil.id}/`) || (tipo !== "pdf" && tipo !== "xml")) return { error: "Archivo no válido." };

  // Espacios de clientes: leen con su propia clave de IA (la de Oscar nunca se usa para ellos)
  const espacio = await obtenerEspacio();
  let clavePropia: string | null = null;
  if (!espacio.principal) {
    clavePropia = await leerSecreto(espacio.id, "ia_clave").catch(() => null);
    if (!clavePropia) return { error: "Para leer estados de cuenta primero agrega tu clave de IA en Mi espacio." };
  }

  const { data: imp, error: e1 } = await supabase.from("importaciones").insert({
    archivo_nombre: nombre.slice(0, 200), archivo_ruta: ruta, archivo_tipo: tipo, archivo_huella: huella, estado: "leyendo",
  }).select("id").single();
  if (e1 || !imp) return { error: `No se pudo registrar el archivo (${e1?.message ?? "sin respuesta"}).` };
  const id = Number(imp.id);

  const { data: blob, error: e2 } = await supabase.storage.from("estados").download(ruta);
  if (e2 || !blob) {
    await supabase.from("importaciones").update({ estado: "error", error: "No se pudo leer el archivo subido." }).eq("id", id);
    return { error: "No se pudo leer el archivo subido.", id };
  }

  let datos: EstadoIA;
  let modelo: string;
  try {
    ({ datos, modelo } = await leerEstadoConIA(Buffer.from(await blob.arrayBuffer()), tipo, nombre, clavePropia));
    datos = fecharMensualidades(quitarMensualidadesSobrantes(quitarCargosDelResumenRepetidos(completarCargosDelResumen(corregirCargoYAbono(datos)))));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    await supabase.from("importaciones").update({ estado: "error", error: msg.slice(0, 1000) }).eq("id", id);
    return { error: `La IA no pudo leer el estado de cuenta (${msg.slice(0, 200)}).`, id };
  }

  // Cuenta: por los últimos 4 dígitos (de la cuenta, tarjeta o CLABE) entre las cuentas que puede capturar
  const term = [datos.terminacion, datos.terminacion_clabe].map((t) => (t ?? "").replace(/\D/g, "").slice(-4)).filter((t) => t.length === 4);
  let cuentaId: number | null = null;
  if (term.length) {
    const { data: cs } = await supabase.from("cuentas").select("id").in("terminacion", term).eq("activa", true);
    cuentaId = (cs ?? []).map((c) => Number(c.id)).find((c) => permisos.puedeEditar(c)) ?? null;
  }

  await supabase.from("importaciones").update({
    estado: "leido", datos, modelo, cuenta_id: cuentaId, banco: datos.banco?.slice(0, 100),
    terminacion: term[0] ?? null,
    periodo_inicio: /^\d{4}-\d{2}-\d{2}$/.test(datos.periodo_inicio ?? "") ? datos.periodo_inicio : null,
    periodo_fin: /^\d{4}-\d{2}-\d{2}$/.test(datos.periodo_fin ?? "") ? datos.periodo_fin : null,
    saldo_inicial: datos.saldo_inicial, saldo_final: datos.saldo_final,
  }).eq("id", id);
  return { id, datos, cuentaId };
}

export function resumir(id: number, nombre: string, datos: EstadoIA, cuentaId: number | null): ResumenLectura {
  const { cuadre } = cuadrar(datos);
  return {
    id, nombre, banco: datos.banco, producto: datos.nombre_producto, terminacion: datos.terminacion,
    tipo_producto: datos.tipo_producto, moneda: datos.moneda,
    periodo_inicio: datos.periodo_inicio, periodo_fin: datos.periodo_fin,
    saldo_inicial: datos.saldo_inicial, saldo_final: datos.saldo_final,
    movimientos: datos.movimientos.length, cuadra: cuadre.aplica ? cuadre.ok : null, diferencia: cuadre.diferencia, cuentaId,
  };
}
