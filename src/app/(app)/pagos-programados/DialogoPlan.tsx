"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import Combobox from "@/components/Combobox";
import { Campo, Dialogo, type Opcion } from "@/components/movimientos/DialogoMovimiento";
import type { Clasif } from "@/components/movimientos/TablaMovimientos";
import { hoyCDMX } from "@/lib/formato";
import { FRECUENCIAS, describirFrecuencia, type PagoProgramado } from "@/lib/pagos";
import type { CuentaCorta } from "@/lib/transacciones";
import { cambiarActivo, eliminarPago, guardarPago, type ResultadoPago } from "./actions";

export default function DialogoPlan({
  pago, cuentas, conceptos, proveedores, clasificaciones, esTitular, onCerrar,
}: {
  pago: PagoProgramado | null;
  cuentas: CuentaCorta[];
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  esTitular: boolean;
  onCerrar: () => void;
}) {
  const accion = guardarPago.bind(null, pago?.id ?? null);
  const [estado, formAction, guardando] = useActionState<ResultadoPago, FormData>(accion, {});
  const [trabajando, startTrabajo] = useTransition();
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string>();
  const dialogo = useRef<HTMLDialogElement>(null);
  const cerrar = () => dialogo.current?.close();
  useEffect(() => { if (estado.ok) dialogo.current?.close(); }, [estado.ok]);

  const p = pago;
  const v = estado.valores;
  const val = (k: string, d: string) => (v && typeof v[k] === "string" ? (v[k] as string) : d);
  const [frecuencia, setFrecuencia] = useState(val("frecuencia", p?.frecuencia ?? "mensual"));
  const [inicio, setInicio] = useState(val("fecha_inicio", p?.fecha_inicio ?? hoyCDMX()));
  const dias = [...(p?.dias_mes ?? [])].sort((a, b) => a - b);
  const e = estado.errores ?? {};
  const soloLectura = !esTitular;
  const clasifElegidas = new Set((v?.clasificaciones as string[] | undefined) ?? (p?.clasificaciones ?? []).map(String));
  const importe = p ? Math.max(p.cargo, p.abono) : 0;
  const tipoInicial = val("tipo", p && p.abono > p.cargo ? "abono" : "cargo");
  const porMes = !["unica", "semanal"].includes(frecuencia);

  function alternarActivo() {
    if (!p) return;
    startTrabajo(async () => {
      const r = await cambiarActivo(p.id, !p.activo);
      if (r.error) setError(r.error); else cerrar();
    });
  }
  function borrar() {
    if (!p) return;
    startTrabajo(async () => {
      const r = await eliminarPago(p.id);
      if (r.error) setError(r.error); else cerrar();
    });
  }

  return (
    <Dialogo titulo={soloLectura ? "Pago programado" : p ? "Editar pago programado" : "Nuevo pago programado"} refDialogo={dialogo} onCerrar={onCerrar}>
      <form action={formAction}>
        <fieldset disabled={soloLectura} className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-6">
          {p && !p.activo && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn sm:col-span-6">Este pago está pausado: no se crean fechas nuevas.</p>
          )}
          {p && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary sm:col-span-6">
              {describirFrecuencia(p)}. Si cambias la frecuencia o las fechas, se recalculan las fechas pendientes de hoy en adelante; las pagadas no cambian.
            </p>
          )}

          <Campo id="p-proveedor" etiqueta="A favor de (proveedor)" error={e.proveedor_id} className="sm:col-span-6">
            <Combobox id="p-proveedor" nombre="proveedor_id" opciones={proveedores.filter((x) => x.activo || x.valor === String(p?.proveedor_id))}
              valorInicial={val("proveedor_id", p?.proveedor_id ? String(p.proveedor_id) : "")} placeholder="Buscar proveedor…" />
          </Campo>
          <Campo id="p-concepto" etiqueta="Concepto" className="sm:col-span-3">
            <Combobox id="p-concepto" nombre="concepto_id" opciones={conceptos.filter((c) => c.activo || c.valor === String(p?.concepto_id))}
              valorInicial={val("concepto_id", p?.concepto_id ? String(p.concepto_id) : "")} placeholder="Buscar concepto…" />
          </Campo>
          <Campo id="p-cuenta" etiqueta="Cuenta para pagar" className="sm:col-span-3" ayuda="Se propone al registrar el pago; la puedes cambiar.">
            <select id="p-cuenta" name="cuenta_id" defaultValue={val("cuenta_id", p?.cuenta_id ? String(p.cuenta_id) : "")} className="input">
              <option value="">Sin cuenta fija</option>
              {cuentas.filter((c) => c.activa || c.cuenta_id === p?.cuenta_id).map((c) => <option key={c.cuenta_id} value={c.cuenta_id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </Campo>

          <fieldset className="sm:col-span-3">
            <legend className="label">Tipo</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
              {(["cargo", "abono"] as const).map((t) => (
                <label key={t} className="cursor-pointer">
                  <input type="radio" name="tipo" value={t} defaultChecked={tipoInicial === t} className="peer sr-only" />
                  <span className={`block rounded-md px-2 py-1.5 text-center text-sm peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${t === "cargo" ? "peer-checked:bg-danger-soft peer-checked:text-danger" : "peer-checked:bg-ok-soft peer-checked:text-ok"}`}>
                    {t === "cargo" ? "Cargo (pago)" : "Abono (cobro)"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Campo id="p-monto" etiqueta="Importe" error={e.monto} className="sm:col-span-3" ayuda="Déjalo en 0 si cambia cada vez.">
            <input id="p-monto" name="monto" type="text" inputMode="decimal" defaultValue={val("monto", p ? String(importe) : "")} className="input num text-right" placeholder="0.00" />
          </Campo>

          <Campo id="p-frecuencia" etiqueta="Se paga" requerido error={e.frecuencia} className="sm:col-span-2">
            <select id="p-frecuencia" name="frecuencia" value={frecuencia} onChange={(ev) => setFrecuencia(ev.target.value)} className="input">
              {FRECUENCIAS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
            </select>
          </Campo>
          <Campo id="p-inicio" etiqueta={frecuencia === "unica" ? "Fecha de pago" : "Primera fecha"} requerido error={e.fecha_inicio} className="sm:col-span-2">
            <input id="p-inicio" name="fecha_inicio" type="date" required value={inicio} onChange={(ev) => setInicio(ev.target.value)} className="input" />
          </Campo>
          {frecuencia !== "unica" ? (
            <Campo id="p-fin" etiqueta="Última fecha" error={e.fecha_fin} className="sm:col-span-2" ayuda="Vacío = sin fin.">
              <input id="p-fin" name="fecha_fin" type="date" defaultValue={val("fecha_fin", p?.fecha_fin ?? "")} className="input" />
            </Campo>
          ) : <div className="hidden sm:col-span-2 sm:block" />}
          {porMes && (
            <>
              <Campo id="p-dia1" etiqueta={frecuencia === "quincenal" ? "Primer día del mes" : "Día del mes"} error={e.dia1} className="sm:col-span-3"
                ayuda="Si el mes es más corto, se usa su último día.">
                <input key={`d1-${inicio}`} id="p-dia1" name="dia1" type="number" min={1} max={31}
                  defaultValue={val("dia1", String(dias[0] && p?.fecha_inicio === inicio ? dias[0] : Number(inicio.slice(8, 10)) || 1))} className="input num" />
              </Campo>
              {frecuencia === "quincenal" && (
                <Campo id="p-dia2" etiqueta="Segundo día del mes" error={e.dia2} className="sm:col-span-3">
                  <input id="p-dia2" name="dia2" type="number" min={1} max={31} defaultValue={val("dia2", String(dias[1] ?? 28))} className="input num" />
                </Campo>
              )}
            </>
          )}

          <Campo id="p-desc" etiqueta="Transacción" className="sm:col-span-4">
            <input id="p-desc" name="descripcion" type="text" defaultValue={val("descripcion", p?.descripcion ?? "")} className="input" maxLength={250} />
          </Campo>
          <Campo id="p-ref" etiqueta="Cheque / referencia" className="sm:col-span-2">
            <input id="p-ref" name="referencia" type="text" defaultValue={val("referencia", p?.referencia ?? "")} className="input" maxLength={100} />
          </Campo>
          <Campo id="p-l1" etiqueta="Leyenda 1" className="sm:col-span-6">
            <input id="p-l1" name="leyenda1" type="text" defaultValue={val("leyenda1", p?.leyenda1 ?? "")} className="input" maxLength={255} />
          </Campo>
          <Campo id="p-l2" etiqueta="Leyenda 2" className="sm:col-span-6">
            <input id="p-l2" name="leyenda2" type="text" defaultValue={val("leyenda2", p?.leyenda2 ?? "")} className="input" maxLength={255} />
          </Campo>
          <Campo id="p-l3" etiqueta="Leyenda 3" className="sm:col-span-6">
            <input id="p-l3" name="leyenda3" type="text" defaultValue={val("leyenda3", p?.leyenda3 ?? "")} className="input" maxLength={500} />
          </Campo>
          {clasificaciones.length > 0 && (
            <fieldset className="sm:col-span-6">
              <legend className="label">Clasificaciones</legend>
              <div className="flex flex-wrap gap-2">
                {clasificaciones.filter((c) => c.activo || clasifElegidas.has(String(c.id))).map((c) => (
                  <label key={c.id} className="cursor-pointer">
                    <input type="checkbox" name="clasificaciones" value={c.id} defaultChecked={clasifElegidas.has(String(c.id))} className="peer sr-only" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />{c.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Campo id="p-obs" etiqueta="Observaciones" className="sm:col-span-6">
            <textarea id="p-obs" name="observaciones" rows={2} defaultValue={val("observaciones", p?.observaciones ?? "")} className="input" />
          </Campo>
          <fieldset className="sm:col-span-6">
            <legend className="label">Avisar al proveedor cuando se pague</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="avisar_whatsapp" defaultChecked={p?.avisar_whatsapp} /> WhatsApp</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="avisar_correo" defaultChecked={p?.avisar_correo} /> Correo</label>
            </div>
            <p className="mt-1 text-xs text-muted">Se envían solos al registrar el pago: la imagen con los datos del pago y los documentos adjuntos.</p>
          </fieldset>
        </fieldset>

        {(estado.error || error) && <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error ?? estado.error}</p>}

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {p && esTitular && (confirmarBorrar ? (
              <>
                <span className="text-sm text-danger">¿Eliminar este pago y sus fechas? Los movimientos ya registrados no se borran.</span>
                <button type="button" className="btn-danger" onClick={borrar} disabled={trabajando}>Sí, eliminar</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmarBorrar(false)}>No</button>
              </>
            ) : (
              <>
                <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmarBorrar(true)}><Trash2 className="h-4 w-4" aria-hidden /> Eliminar</button>
                <button type="button" className="btn-ghost" onClick={alternarActivo} disabled={trabajando}>
                  {p.activo ? <><Pause className="h-4 w-4" aria-hidden /> Pausar</> : <><Play className="h-4 w-4" aria-hidden /> Reanudar</>}
                </button>
              </>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={cerrar}>{soloLectura ? "Cerrar" : "Cancelar"}</button>
            {!soloLectura && <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>}
          </div>
        </div>
      </form>
    </Dialogo>
  );
}
