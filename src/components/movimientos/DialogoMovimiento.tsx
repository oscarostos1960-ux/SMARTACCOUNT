"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Sparkles, Trash2, X } from "lucide-react";
import Combobox, { type OpcionCombo } from "@/components/Combobox";
import { fecha as fmtFecha, hoyCDMX } from "@/lib/formato";
import type { CuentaCorta, Movimiento } from "@/lib/transacciones";
import {
  eliminarMovimiento, enviarAviso, guardarMovimiento, guardarTransferencia, siguienteFolioCuenta, ultimoMovimientoProveedor,
  type Plantilla, type ResultadoMovimiento,
} from "@/app/(app)/transacciones/actions";
import Documentos, { subirArchivos } from "./Documentos";
import AvisosMovimiento, { ListaResultados } from "./Avisos";
import type { ResultadoAviso } from "@/lib/avisos";
import type { Clasif } from "./TablaMovimientos";

export type Opcion = OpcionCombo & { activo: boolean };

export function Dialogo({ titulo, refDialogo, onCerrar, children }: {
  titulo: string; refDialogo: React.RefObject<HTMLDialogElement | null>; onCerrar: () => void; children: React.ReactNode;
}) {
  useEffect(() => { refDialogo.current?.showModal(); }, [refDialogo]);
  return (
    <dialog
      ref={refDialogo}
      onClose={onCerrar}
      aria-labelledby="titulo-dialogo"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="titulo-dialogo" className="text-lg font-semibold">{titulo}</h2>
        <button type="button" className="btn-ghost p-1.5" onClick={() => refDialogo.current?.close()} aria-label="Cerrar"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      {children}
    </dialog>
  );
}

export function Campo({ id, etiqueta, error, requerido, ayuda, className = "", children }: {
  id: string; etiqueta: string; error?: string; requerido?: boolean; ayuda?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{etiqueta} {requerido && <span className="text-danger" aria-hidden>*</span>}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>
        : ayuda ? <p className="mt-1 text-xs text-muted">{ayuda}</p> : null}
    </div>
  );
}

// Datos para llenar un movimiento nuevo (por ejemplo, al pagar un pago programado)
export type Inicial = Plantilla & { proveedor_id: string };

export function DialogoMovimiento({
  cuenta, movimiento, siguienteFolio, conceptos, proveedores, clasificaciones, puedeEditar, onCerrar,
  cuentas, inicial, aviso, titulo: tituloFijo, vencimientoId, avisoPrevio,
}: {
  cuenta: CuentaCorta;
  movimiento: Movimiento | null;
  siguienteFolio: number;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  puedeEditar: boolean;
  onCerrar: () => void;
  cuentas?: CuentaCorta[];        // si viene, se puede elegir la cuenta
  inicial?: Inicial;
  aviso?: string;
  titulo?: string;
  vencimientoId?: number;
  avisoPrevio?: string;           // texto que explica qué avisos se enviarán al guardar
}) {
  const [cuentaSel, setCuentaSel] = useState(cuenta);
  const [folio, setFolio] = useState({ valor: siguienteFolio, version: 0 });
  const accion = guardarMovimiento.bind(null, cuentaSel.cuenta_id, movimiento?.id ?? null);
  const [estado, formAction, guardando] = useActionState<ResultadoMovimiento, FormData>(accion, {});
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const [errorBorrar, setErrorBorrar] = useState<string>();
  const [plantilla, setPlantilla] = useState<Plantilla | null>(inicial ?? null);
  const [version, setVersion] = useState(0);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivos, setErrorArchivos] = useState<string>();
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [resultadoAvisos, setResultadoAvisos] = useState<ResultadoAviso[]>();
  const terminado = !!(errorArchivos || resultadoAvisos);
  const dialogo = useRef<HTMLDialogElement>(null);
  const cerrar = () => dialogo.current?.close();

  // Al guardar un movimiento nuevo: se suben los archivos elegidos, se envían los avisos
  // (si el pago programado los tiene activados) y se cierra.
  useEffect(() => {
    if (!estado.ok) return;
    if ((!archivos.length && !estado.avisar) || !estado.id) {
      dialogo.current?.close();
      return;
    }
    let vivo = true;
    (async () => {
      let errores: string[] = [];
      if (archivos.length) {
        setSubiendo(true);
        errores = await subirArchivos(cuentaSel.cuenta_id, estado.id!, archivos);
        if (!vivo) return;
        setSubiendo(false);
      }
      let avisos: ResultadoAviso[] = [];
      if (estado.avisar?.length) {
        setEnviandoAviso(true);
        const r = await enviarAviso(estado.id!, estado.avisar);
        if (!vivo) return;
        setEnviandoAviso(false);
        avisos = r.resultados ?? [{ canal: estado.avisar[0], ok: false, destino: null, mensaje: r.error ?? "No se pudo enviar el aviso." }];
      }
      if (errores.length) setErrorArchivos(`El movimiento se guardó, pero: ${errores.join(" ")}`);
      if (avisos.length) setResultadoAvisos(avisos);
      else if (!errores.length) dialogo.current?.close();
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const m = movimiento;
  const v = estado.valores;
  const p = plantilla;
  const val = (k: string, porDefecto: string) => (v && typeof v[k] === "string" ? (v[k] as string) : porDefecto);
  const neto = m ? Number(m.abono) - Number(m.cargo) : 0;
  const tipoInicial = val("tipo", m ? (neto > 0 ? "abono" : "cargo") : p?.tipo ?? "cargo");
  const montoInicial = val("monto", m ? String(Math.abs(neto) || Number(m.cargo) || Number(m.abono) || "") : p?.monto ?? "");
  const clasifElegidas = new Set((v?.clasificaciones as string[] | undefined) ?? (m ? (m.clasificaciones ?? []).map(String) : p?.clasificaciones ?? []));
  const conceptoInicial = val("concepto_id", m?.concepto_id ? String(m.concepto_id) : p?.concepto_id ?? "");
  const conceptosVisibles = conceptos.filter((c) => c.activo || c.valor === conceptoInicial);
  const proveedoresVisibles = proveedores.filter((x) => x.activo || x.valor === String(m?.proveedor_id));
  const clasifVisibles = clasificaciones.filter((c) => c.activo || clasifElegidas.has(String(c.id)));
  const e = estado.errores ?? {};
  const soloLectura = !puedeEditar;
  const titulo = tituloFijo ?? (soloLectura ? "Detalle del movimiento" : m ? `Editar movimiento · folio ${m.folio}` : "Nuevo movimiento");

  async function cambiarCuenta(id: string) {
    const nueva = cuentas?.find((c) => String(c.cuenta_id) === id);
    if (!nueva) return;
    setCuentaSel(nueva);
    const siguiente = await siguienteFolioCuenta(nueva.cuenta_id);
    setFolio((f) => ({ valor: siguiente, version: f.version + 1 }));
  }

  async function alElegirProveedor(valor: string) {
    if (m || !valor) return;
    const datos = await ultimoMovimientoProveedor(Number(valor), cuentaSel.cuenta_id);
    if (datos) {
      setPlantilla(datos);
      setVersion((x) => x + 1);
    }
  }

  function borrar() {
    if (!m) return;
    startBorrar(async () => {
      const r = await eliminarMovimiento(m.id);
      if (r.error) setErrorBorrar(r.error);
      else cerrar();
    });
  }

  return (
    <Dialogo titulo={titulo} refDialogo={dialogo} onCerrar={onCerrar}>
      <form action={formAction}>
        <fieldset disabled={soloLectura || subiendo || enviandoAviso || terminado} className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-6">
          {m?.transferencia_id && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary sm:col-span-6">
              Este movimiento es parte de una transferencia. Si lo eliminas, también se elimina el movimiento de la otra cuenta.
            </p>
          )}
          {m?.es_ajuste && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn sm:col-span-6">Ajuste creado al migrar del sistema anterior.</p>
          )}
          {p && !m && (
            <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary sm:col-span-6">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{p === inicial && aviso ? aviso : <>Datos copiados del último movimiento con este proveedor (folio {p.folio_origen}, {fmtFecha(p.fecha_origen)}{p.cuenta_origen !== cuentaSel.nombre ? `, ${p.cuenta_origen}` : ""}). Revisa y cambia lo que necesites.</>}</span>
            </p>
          )}
          {vencimientoId && <input type="hidden" name="vencimiento_id" value={vencimientoId} />}
          {cuentas && !m && (
            <Campo id="m-cuenta" etiqueta="Cuenta" requerido className="sm:col-span-6" ayuda="Cuenta de la que sale (o a la que entra) el dinero.">
              <select id="m-cuenta" value={cuentaSel.cuenta_id} onChange={(ev) => cambiarCuenta(ev.target.value)} className="input">
                {cuentas.map((c) => <option key={c.cuenta_id} value={c.cuenta_id}>{c.nombre} ({c.moneda})</option>)}
              </select>
            </Campo>
          )}

          <Campo id="m-proveedor" etiqueta="A favor de (proveedor)" className="sm:col-span-6" ayuda={!m ? "Al elegirlo, se llenan los datos de su último movimiento." : undefined}>
            <Combobox id="m-proveedor" nombre="proveedor_id" opciones={proveedoresVisibles} valorInicial={val("proveedor_id", m?.proveedor_id ? String(m.proveedor_id) : inicial?.proveedor_id ?? "")} placeholder="Buscar proveedor…" onCambio={alElegirProveedor} />
          </Campo>

          <Campo id="m-folio" etiqueta="Folio" error={e.folio} className="sm:col-span-2"
            ayuda={m ? "Si lo cambias, el movimiento se mueve a ese lugar." : "Si usas un folio ya ocupado, se inserta ahí y los siguientes se recorren."}>
            <input key={folio.version} id="m-folio" name="folio" type="text" inputMode="numeric" defaultValue={folio.version ? String(folio.valor) : val("folio", m ? String(m.folio) : String(folio.valor))} className="input num" aria-invalid={!!e.folio} />
          </Campo>
          <Campo id="m-fecha" etiqueta="Fecha" requerido error={e.fecha} className="sm:col-span-2">
            <input id="m-fecha" name="fecha" type="date" required defaultValue={val("fecha", m?.fecha ?? hoyCDMX())} className="input" aria-invalid={!!e.fecha} />
          </Campo>
          <Campo id="m-ref" etiqueta="Cheque / referencia" className="sm:col-span-2">
            <input id="m-ref" name="referencia" type="text" defaultValue={val("referencia", m?.referencia ?? p?.referencia ?? "")} className="input" maxLength={100} />
          </Campo>

          {/* Campos que se pueden prellenar: se vuelven a dibujar al elegir proveedor */}
          <div key={version} className="contents">
            <fieldset className="sm:col-span-3">
              <legend className="label">Tipo <span className="text-danger" aria-hidden>*</span></legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
                {(["cargo", "abono"] as const).map((t) => (
                  <label key={t} className="cursor-pointer">
                    <input type="radio" name="tipo" value={t} defaultChecked={tipoInicial === t} className="peer sr-only" />
                    <span className={`block rounded-md px-2 py-1.5 text-center text-sm peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${t === "cargo" ? "peer-checked:bg-danger-soft peer-checked:text-danger" : "peer-checked:bg-ok-soft peer-checked:text-ok"}`}>
                      {t === "cargo" ? "Cargo" : "Abono"}
                    </span>
                  </label>
                ))}
              </div>
              {e.tipo && <p className="mt-1 text-xs text-danger">{e.tipo}</p>}
            </fieldset>
            <Campo id="m-monto" etiqueta={`Importe (${cuentaSel.moneda})`} requerido error={e.monto} className="sm:col-span-3">
              <input id="m-monto" name="monto" type="text" inputMode="decimal" required defaultValue={montoInicial} className="input num text-right" aria-invalid={!!e.monto} placeholder="0.00" />
            </Campo>
            <Campo id="m-desc" etiqueta="Transacción" error={e.descripcion} className="sm:col-span-6">
              <input id="m-desc" name="descripcion" type="text" defaultValue={val("descripcion", m?.descripcion ?? p?.descripcion ?? "")} className="input" maxLength={250} aria-invalid={!!e.descripcion} />
            </Campo>
            <Campo id="m-l1" etiqueta="Leyenda 1" className="sm:col-span-6">
              <input id="m-l1" name="leyenda1" type="text" defaultValue={val("leyenda1", m?.leyenda1 ?? p?.leyenda1 ?? "")} className="input" maxLength={255} />
            </Campo>
            <Campo id="m-l2" etiqueta="Leyenda 2" className="sm:col-span-6">
              <input id="m-l2" name="leyenda2" type="text" defaultValue={val("leyenda2", m?.leyenda2 ?? p?.leyenda2 ?? "")} className="input" maxLength={255} />
            </Campo>
            <Campo id="m-l3" etiqueta="Leyenda 3" className="sm:col-span-6">
              <input id="m-l3" name="leyenda3" type="text" defaultValue={val("leyenda3", m?.leyenda3 ?? p?.leyenda3 ?? "")} className="input" maxLength={500} />
            </Campo>
            <Campo id="m-concepto" etiqueta="Concepto" className={cuentaSel.moneda !== "MXN" ? "sm:col-span-4" : "sm:col-span-6"}>
              <Combobox id="m-concepto" nombre="concepto_id" opciones={conceptosVisibles} valorInicial={conceptoInicial} placeholder="Buscar concepto…" />
            </Campo>
            {cuentaSel.moneda !== "MXN" ? (
              <Campo id="m-tc" etiqueta="Tipo de cambio" error={e.tipo_cambio} className="sm:col-span-2" ayuda={`Pesos por 1 ${cuentaSel.moneda}`}>
                <input id="m-tc" name="tipo_cambio" type="text" inputMode="decimal" defaultValue={val("tipo_cambio", m ? String(Number(m.tipo_cambio)) : "1")} className="input num text-right" />
              </Campo>
            ) : (
              <input type="hidden" name="tipo_cambio" value={m ? String(Number(m.tipo_cambio)) : "1"} />
            )}
            {clasifVisibles.length > 0 && (
              <fieldset className="sm:col-span-6">
                <legend className="label">Clasificaciones</legend>
                <div className="flex flex-wrap gap-2">
                  {clasifVisibles.map((c) => (
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
            <Campo id="m-obs" etiqueta="Observaciones" className="sm:col-span-6">
              <textarea id="m-obs" name="observaciones" rows={2} defaultValue={val("observaciones", m?.observaciones ?? p?.observaciones ?? "")} className="input" />
            </Campo>
          </div>

          {m ? (
            <>
              <Documentos cuentaId={cuenta.cuenta_id} movimientoId={m.id} puedeEditar={puedeEditar} />
              {m.proveedor_id && <AvisosMovimiento movimientoId={m.id} puedeEditar={puedeEditar} />}
            </>
          ) : (
            <div
              className="sm:col-span-6"
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
              onDrop={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setArchivos((a) => [...a, ...e.dataTransfer.files]); } }}
            >
              <label htmlFor="m-archivos" className="label flex items-center gap-1.5"><Paperclip className="h-4 w-4" aria-hidden /> Documentos</label>
              {/* Sin "name": los archivos no viajan con el formulario, se suben directo al guardar */}
              <input id="m-archivos" type="file" multiple className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" onChange={(ev) => setArchivos([...(ev.target.files ?? [])])} />
              <p className="mt-1 text-xs text-muted">{archivos.length > 0 ? `${archivos.length} archivo(s) se adjuntarán al guardar: ${archivos.map((a) => a.name).join(", ")}` : "También puedes arrastrarlos aquí."}</p>
            </div>
          )}
        </fieldset>

        {avisoPrevio && !m && !terminado && (
          <p className="mx-5 mb-3 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">{enviandoAviso ? "Enviando aviso al proveedor…" : avisoPrevio}</p>
        )}
        {resultadoAvisos && (
          <div className="mx-5 mb-3"><ListaResultados resultados={resultadoAvisos} /></div>
        )}
        {(estado.error || errorBorrar || errorArchivos) && (
          <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errorArchivos ?? errorBorrar ?? estado.error}</p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {m && puedeEditar && (confirmarBorrar ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-danger">¿Eliminar{m.transferencia_id ? " la transferencia completa" : ""}? Los folios siguientes se recorren.</span>
                <button type="button" className="btn-danger" onClick={borrar} disabled={borrando}>{borrando ? "Eliminando…" : "Sí, eliminar"}</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmarBorrar(false)}>No</button>
              </div>
            ) : (
              <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmarBorrar(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Eliminar
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={cerrar}>{soloLectura || terminado ? "Cerrar" : "Cancelar"}</button>
            {!soloLectura && !terminado && (
              <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={guardando || subiendo || enviandoAviso}>
                {enviandoAviso ? "Enviando aviso…" : subiendo ? "Subiendo documentos…" : guardando ? "Guardando…" : "Guardar"}
              </button>
            )}
          </div>
        </div>
      </form>
    </Dialogo>
  );
}

export function DialogoTransferencia({ cuenta, cuentas, conceptos, onCerrar }: {
  cuenta: CuentaCorta; cuentas: CuentaCorta[]; conceptos: Opcion[]; onCerrar: () => void;
}) {
  const accion = guardarTransferencia.bind(null, cuenta.cuenta_id);
  const [estado, formAction, guardando] = useActionState<ResultadoMovimiento, FormData>(accion, {});
  const v = estado.valores;
  const val = (k: string, d: string) => (v && typeof v[k] === "string" ? (v[k] as string) : d);
  const [destino, setDestino] = useState(val("destino", ""));
  const monedaDestino = cuentas.find((c) => String(c.cuenta_id) === destino)?.moneda;
  const otraMoneda = !!monedaDestino && monedaDestino !== cuenta.moneda;
  const dialogo = useRef<HTMLDialogElement>(null);
  const cerrar = () => dialogo.current?.close();
  useEffect(() => { if (estado.ok) dialogo.current?.close(); }, [estado.ok]);
  const e = estado.errores ?? {};

  return (
    <Dialogo titulo="Transferencia entre cuentas" refDialogo={dialogo} onCerrar={onCerrar}>
      <form action={formAction}>
        <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <p className="text-sm text-muted sm:col-span-2">
            Se registra un cargo en <strong className="text-text">{cuenta.nombre}</strong> y un abono en la cuenta destino, cada uno con el siguiente folio de su cuenta.
          </p>
          <Campo id="t-destino" etiqueta="Cuenta destino" requerido error={e.destino} className="sm:col-span-2">
            <select id="t-destino" name="destino" required value={destino} onChange={(ev) => setDestino(ev.target.value)} className="input" aria-invalid={!!e.destino}>
              <option value="">Selecciona…</option>
              {cuentas.map((c) => <option key={c.cuenta_id} value={c.cuenta_id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </Campo>
          <Campo id="t-fecha" etiqueta="Fecha" requerido error={e.fecha}>
            <input id="t-fecha" name="fecha" type="date" required defaultValue={val("fecha", hoyCDMX())} className="input" />
          </Campo>
          <Campo id="t-monto" etiqueta={`Importe que sale (${cuenta.moneda})`} requerido error={e.monto}>
            <input id="t-monto" name="monto" type="text" inputMode="decimal" required defaultValue={val("monto", "")} className="input num text-right" placeholder="0.00" />
          </Campo>
          {otraMoneda && (
            <Campo id="t-monto2" etiqueta={`Importe que llega (${monedaDestino})`} error={e.monto_destino} className="sm:col-span-2" ayuda="Las cuentas tienen distinta moneda: escribe lo que se recibió.">
              <input id="t-monto2" name="monto_destino" type="text" inputMode="decimal" required defaultValue={val("monto_destino", "")} className="input num text-right" />
            </Campo>
          )}
          <Campo id="t-desc" etiqueta="Transacción" className="sm:col-span-2">
            <input id="t-desc" name="descripcion" type="text" defaultValue={val("descripcion", "TRANSFERENCIA")} className="input" maxLength={250} />
          </Campo>
          <Campo id="t-concepto" etiqueta="Concepto" className="sm:col-span-2">
            <Combobox id="t-concepto" nombre="concepto_id" opciones={conceptos} valorInicial={val("concepto_id", "")} placeholder="Buscar concepto…" />
          </Campo>
          <Campo id="t-obs" etiqueta="Observaciones" className="sm:col-span-2">
            <textarea id="t-obs" name="observaciones" rows={2} defaultValue={val("observaciones", "")} className="input" />
          </Campo>
        </div>
        {estado.error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{estado.error}</p>}
        <div className="flex gap-2 border-t border-border px-5 py-4 sm:justify-end">
          <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={cerrar}>Cancelar</button>
          <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={guardando}>{guardando ? "Guardando…" : "Registrar transferencia"}</button>
        </div>
      </form>
    </Dialogo>
  );
}
