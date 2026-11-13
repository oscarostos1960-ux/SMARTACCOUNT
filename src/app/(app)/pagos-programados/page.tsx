import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { hoyCDMX } from "@/lib/formato";
import { cargarCatalogosMovimiento } from "@/lib/catalogos-movimiento";
import { moverMes, proximaFechaConDia, sumarDias, type CopiaPago, type PagoProgramado, type Vencimiento } from "@/lib/pagos";
import type { CuentaCorta } from "@/lib/transacciones";
import PagosVista, { type Vista } from "./PagosVista";

export const metadata: Metadata = { title: "Pagos programados" };

const VISTAS: Vista[] = ["por-vencer", "calendario", "pagos"];

export default async function PagosProgramadosPage(props: PageProps<"/pagos-programados">) {
  const sp = await props.searchParams;
  const vista = VISTAS.includes(sp.vista as Vista) ? (sp.vista as Vista) : "por-vencer";
  const hoy = hoyCDMX();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoy.slice(0, 7);
  const fechaParam = (k: string) => (typeof sp[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp[k] as string) ? (sp[k] as string) : "");
  const desde = fechaParam("desde");
  const hasta = fechaParam("hasta");

  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  // Crea las fechas que falten (solo el titular; es rápido si ya están creadas).
  if (permisos.esTitular) await supabase.rpc("generar_vencimientos");

  const venc = () => supabase.from("v_vencimientos").select("*").order("fecha").order("id").limit(3000);
  let vencR: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
  if (vista === "calendario") {
    vencR = await venc().gte("fecha", `${mes}-01`).lt("fecha", `${moverMes(mes, 1)}-01`);
  } else if (vista === "por-vencer" && (desde || hasta)) {
    // Con fechas: todo lo del periodo (pendiente, pagado u omitido)
    let consulta = venc();
    if (desde) consulta = consulta.gte("fecha", desde);
    consulta = consulta.lte("fecha", hasta || sumarDias(hoy, 90));
    vencR = await consulta;
  } else if (vista === "por-vencer") {
    // Pendientes (incluye atrasados) hasta 90 días, y lo pagado u omitido en los últimos 30 días
    const [pend, hechos] = await Promise.all([
      venc().eq("estado", "pendiente").lte("fecha", sumarDias(hoy, 90)),
      venc().neq("estado", "pendiente").gte("fecha", sumarDias(hoy, -30)).lte("fecha", sumarDias(hoy, 90)),
    ]);
    vencR = { data: [...(pend.data ?? []), ...(hechos.data ?? [])], error: pend.error ?? hechos.error };
  }

  const [pagosR, clasifR, proximosR, catalogos, cuentasR] = await Promise.all([
    supabase.from("pagos_programados").select("*").order("id"),
    supabase.from("pago_programado_clasificaciones").select("pago_id, clasificacion_id"),
    supabase.from("vencimientos").select("pago_id, fecha").eq("estado", "pendiente").order("fecha").limit(5000),
    cargarCatalogosMovimiento(supabase),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
  ]);

  const clasifPorPago = new Map<number, number[]>();
  for (const c of clasifR.data ?? []) {
    const k = Number(c.pago_id);
    clasifPorPago.set(k, [...(clasifPorPago.get(k) ?? []), Number(c.clasificacion_id)]);
  }
  const proximo = new Map<number, string>();
  const atrasados = new Map<number, number>();
  for (const v of proximosR.data ?? []) {
    const k = Number(v.pago_id);
    if (v.fecha < hoy) atrasados.set(k, (atrasados.get(k) ?? 0) + 1);
    else if (!proximo.has(k)) proximo.set(k, v.fecha);
  }
  const pagos = (pagosR.data ?? []).map((p) => ({
    ...p,
    cargo: Number(p.cargo),
    abono: Number(p.abono),
    clasificaciones: clasifPorPago.get(Number(p.id)) ?? [],
    proximo: proximo.get(Number(p.id)) ?? null,
    pendientes: atrasados.get(Number(p.id)) ?? 0,
  })) as PagoProgramado[];

  // ?duplicar=<id de movimiento>: nuevo pago programado con los datos de ese movimiento
  let copiaInicial: CopiaPago | undefined;
  const duplicar = typeof sp.duplicar === "string" && /^\d+$/.test(sp.duplicar) ? Number(sp.duplicar) : 0;
  if (duplicar && permisos.esTitular) {
    const [movR, clasMovR] = await Promise.all([
      supabase.from("transacciones").select("cuenta_id, fecha, descripcion, cargo, abono, concepto_id, proveedor_id, referencia, leyenda1, leyenda2, leyenda3, observaciones, aviso_whatsapp, aviso_correo")
        .eq("id", duplicar).maybeSingle(),
      supabase.from("transaccion_clasificaciones").select("clasificacion_id").eq("transaccion_id", duplicar),
    ]);
    const m = movR.data;
    if (m) {
      const dia = Number(String(m.fecha).slice(8, 10)) || 1;
      const inicio = proximaFechaConDia(hoy, dia);
      copiaInicial = {
        cuenta_id: m.cuenta_id, proveedor_id: m.proveedor_id, concepto_id: m.concepto_id,
        descripcion: m.descripcion ?? "", cargo: Number(m.cargo), abono: Number(m.abono),
        referencia: m.referencia, leyenda1: m.leyenda1, leyenda2: m.leyenda2, leyenda3: m.leyenda3, observaciones: m.observaciones,
        frecuencia: "unica", dias_mes: [dia], dia_semana: null, fecha_inicio: inicio, fecha_fin: null,
        avisar_whatsapp: !!m.aviso_whatsapp, avisar_correo: !!m.aviso_correo,
        clasificaciones: (clasMovR.data ?? []).map((c) => Number(c.clasificacion_id)),
        origen: `Copia del movimiento del ${String(m.fecha).slice(8, 10)}/${String(m.fecha).slice(5, 7)}/${String(m.fecha).slice(0, 4)}`,
      };
    }
  }

  const cuentas = (cuentasR.data ?? []) as CuentaCorta[];
  const editables = cuentas.filter((c) => c.activa && permisos.puedeEditar(c.cuenta_id));

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Pagos programados</h1>
        <p className="mt-1 text-sm text-muted">Lo que tienes por pagar, cuándo vence y lo que ya quedó pagado.</p>
      </header>
      {vencR.error || pagosR.error ? (
        <p className="card p-6 text-sm text-danger">No se pudieron cargar los pagos: {(vencR.error ?? pagosR.error)?.message}</p>
      ) : (
        <PagosVista
          abrirNuevo={sp.nuevo === "1"}
          copiaInicial={copiaInicial}
          vista={vista}
          mes={mes}
          hoy={hoy}
          desde={desde}
          hasta={hasta}
          vencimientos={(vencR.data ?? []) as Vencimiento[]}
          pagos={pagos}
          cuentas={cuentas}
          cuentasEditables={editables}
          esTitular={permisos.esTitular}
          {...catalogos}
        />
      )}
    </div>
  );
}
