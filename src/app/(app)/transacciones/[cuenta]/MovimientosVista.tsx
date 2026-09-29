"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeftRight, ChevronLeft, ChevronRight, Download, Filter, Mail, MessageCircle, Plus, Scale, Search, Trash2, X,
} from "lucide-react";
import Combobox, { type OpcionCombo } from "@/components/Combobox";
import { dinero, fecha as fmtFecha, hoyCDMX } from "@/lib/formato";
import { aConsulta, type Filtros, type Movimiento, type SaldoCuenta } from "@/lib/transacciones";
import {
  eliminarMovimiento, guardarMovimiento, guardarTransferencia, type ResultadoMovimiento,
} from "../actions";

type Opcion = OpcionCombo & { activo: boolean };
type Clasif = { id: number; nombre: string; color: string; activo: boolean };
type CuentaCorta = Pick<SaldoCuenta, "cuenta_id" | "nombre" | "moneda" | "activa">;

export default function MovimientosVista({
  cuenta, movimientos, total, totalCargos, totalAbonos, filtros, porPagina,
  conceptos, proveedores, clasificaciones, cuentas, puedeEditar,
}: {
  cuenta: SaldoCuenta;
  movimientos: Movimiento[];
  total: number;
  totalCargos: number;
  totalAbonos: number;
  filtros: Filtros;
  porPagina: number;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  cuentas: CuentaCorta[];
  puedeEditar: boolean;
}) {
  const [abierto, setAbierto] = useState<Movimiento | "nuevo" | "transferencia" | null>(null);
  const [version, setVersion] = useState(0);
  const moneda = cuenta.moneda;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const hayFiltros = !!(filtros.desde || filtros.hasta || filtros.texto || filtros.concepto || filtros.proveedor || filtros.clasificacion || filtros.tipo);
  const clasifPorId = new Map(clasificaciones.map((c) => [c.id, c]));
  const base = `/transacciones/${cuenta.cuenta_id}`;
  const { pagina, ...sinPagina } = filtros;

  function abrir(m: Movimiento | "nuevo" | "transferencia") {
    setVersion((v) => v + 1);
    setAbierto(m);
  }

  return (
    <>
      {/* Filtros (formulario normal: los filtros quedan en la dirección y se pueden guardar como favorito) */}
      <form method="get" action={base} className="card mb-4 p-4" role="search" aria-label="Filtrar movimientos">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="f-texto" className="label">Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input id="f-texto" name="texto" type="search" defaultValue={filtros.texto} className="input pl-9" placeholder="Descripción, referencia, proveedor, importe…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex">
            <div>
              <label htmlFor="f-desde" className="label">Desde</label>
              <input id="f-desde" name="desde" type="date" defaultValue={filtros.desde} className="input" />
            </div>
            <div>
              <label htmlFor="f-hasta" className="label">Hasta</label>
              <input id="f-hasta" name="hasta" type="date" defaultValue={filtros.hasta} className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 lg:flex-none"><Filter className="h-4 w-4" aria-hidden /> Filtrar</button>
            {hayFiltros && <Link href={base} className="btn-secondary">Limpiar</Link>}
          </div>
        </div>
        <details className="mt-3" open={!!(filtros.concepto || filtros.proveedor || filtros.clasificacion || filtros.tipo)}>
          <summary className="cursor-pointer text-sm font-medium text-primary">Más filtros</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="f-tipo" className="label">Tipo</label>
              <select id="f-tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className="input">
                <option value="">Cargos y abonos</option>
                <option value="cargos">Solo cargos</option>
                <option value="abonos">Solo abonos</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-concepto" className="label">Concepto</label>
              <Combobox id="f-concepto" nombre="concepto" opciones={conceptos} valorInicial={filtros.concepto ? String(filtros.concepto) : ""} placeholder="Todos" />
            </div>
            <div>
              <label htmlFor="f-proveedor" className="label">Proveedor</label>
              <Combobox id="f-proveedor" nombre="proveedor" opciones={proveedores} valorInicial={filtros.proveedor ? String(filtros.proveedor) : ""} placeholder="Todos" />
            </div>
            <div>
              <label htmlFor="f-clasif" className="label">Clasificación</label>
              <select id="f-clasif" name="clasificacion" defaultValue={filtros.clasificacion ?? ""} className="input">
                <option value="">Todas</option>
                {clasificaciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
        </details>
      </form>

      {/* Resumen y acciones */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="text-muted">Movimientos:</dt><dd className="num font-medium">{total.toLocaleString("es-MX")}</dd></div>
          <div className="flex gap-1"><dt className="text-muted">Cargos:</dt><dd className="num font-medium text-danger">{dinero(totalCargos, moneda)}</dd></div>
          <div className="flex gap-1"><dt className="text-muted">Abonos:</dt><dd className="num font-medium text-ok">{dinero(totalAbonos, moneda)}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {total > 0 && (
            <a href={`${base}/exportar${aConsulta(sinPagina)}`} className="btn-secondary" download>
              <Download className="h-4 w-4" aria-hidden /> Excel
            </a>
          )}
          {puedeEditar && (
            <>
              <button className="btn-secondary" onClick={() => abrir("transferencia")}>
                <ArrowLeftRight className="h-4 w-4" aria-hidden /> Transferencia
              </button>
              <button className="btn-primary" onClick={() => abrir("nuevo")}>
                <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
              </button>
            </>
          )}
        </div>
      </div>

      {movimientos.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="font-medium">{hayFiltros ? "Ningún movimiento coincide con los filtros" : "Esta cuenta aún no tiene movimientos"}</p>
          <p className="mt-1 text-sm text-muted">
            {hayFiltros ? "Prueba con otras fechas o palabras." : puedeEditar ? "Registra el primero con “Nuevo movimiento”." : ""}
          </p>
        </div>
      ) : (
        <>
          {/* Escritorio */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Movimiento</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cargo</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Abono</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movimientos.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer align-top hover:bg-surface-2"
                    onClick={() => abrir(m)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") abrir(m); }}
                    aria-label={`${fmtFecha(m.fecha)}, ${m.descripcion || m.concepto || "movimiento"}, ${m.cargo > 0 ? "cargo " + dinero(m.cargo, moneda) : "abono " + dinero(m.abono, moneda)}`}
                  >
                    <td className="num whitespace-nowrap px-4 py-3 text-muted">{fmtFecha(m.fecha)}</td>
                    <td className="max-w-md px-4 py-3">
                      <Detalle m={m} clasifPorId={clasifPorId} />
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right text-danger">{Number(m.cargo) > 0 ? dinero(m.cargo, moneda) : ""}</td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right text-ok">{Number(m.abono) > 0 ? dinero(m.abono, moneda) : ""}</td>
                    <td className={`num whitespace-nowrap px-4 py-3 text-right font-medium ${Number(m.saldo) < 0 ? "text-danger" : ""}`}>{dinero(m.saldo, moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular */}
          <ul className="space-y-2 md:hidden">
            {movimientos.map((m) => (
              <li key={m.id}>
                <button className="card w-full p-4 text-left" onClick={() => abrir(m)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="num text-xs text-muted">{fmtFecha(m.fecha)}</p>
                      <Detalle m={m} clasifPorId={clasifPorId} />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`num font-semibold ${Number(m.cargo) > 0 ? "text-danger" : "text-ok"}`}>
                        {Number(m.cargo) > 0 ? `−${dinero(m.cargo, moneda)}` : `+${dinero(m.abono, moneda)}`}
                      </p>
                      <p className="num mt-1 text-xs text-muted">Saldo {dinero(m.saldo, moneda)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Páginas">
              {pagina > 1
                ? <Link className="btn-secondary" href={`${base}${aConsulta({ ...filtros, pagina: pagina - 1 })}`}><ChevronLeft className="h-4 w-4" aria-hidden /> Más recientes</Link>
                : <span />}
              <p className="text-sm text-muted">Página {pagina} de {paginas.toLocaleString("es-MX")}</p>
              {pagina < paginas
                ? <Link className="btn-secondary" href={`${base}${aConsulta({ ...filtros, pagina: pagina + 1 })}`}>Anteriores <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                : <span />}
            </nav>
          )}
        </>
      )}

      {abierto === "transferencia" && (
        <DialogoTransferencia key={version} cuenta={cuenta} cuentas={cuentas.filter((c) => c.activa)} conceptos={conceptos.filter((c) => c.activo)} onCerrar={() => setAbierto(null)} />
      )}
      {abierto && abierto !== "transferencia" && (
        <DialogoMovimiento
          key={version}
          cuenta={cuenta}
          movimiento={abierto === "nuevo" ? null : abierto}
          conceptos={conceptos}
          proveedores={proveedores}
          clasificaciones={clasificaciones}
          puedeEditar={puedeEditar}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}

function Detalle({ m, clasifPorId }: { m: Movimiento; clasifPorId: Map<number, Clasif> }) {
  const titulo = m.descripcion || m.concepto || m.proveedor || "Movimiento";
  const sub = [m.proveedor, m.concepto !== titulo ? m.concepto : null, m.referencia ? `Ref. ${m.referencia}` : null].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <p className="font-medium [overflow-wrap:anywhere]">{titulo}</p>
      {sub && <p className="text-xs text-muted [overflow-wrap:anywhere]">{sub}</p>}
      {(m.leyenda1 || m.leyenda2) && <p className="text-xs text-muted/80 [overflow-wrap:anywhere]">{[m.leyenda1, m.leyenda2].filter(Boolean).join(" · ")}</p>}
      <Insignias m={m} clasifPorId={clasifPorId} />
    </div>
  );
}

function Insignias({ m, clasifPorId }: { m: Movimiento; clasifPorId: Map<number, Clasif> }) {
  const lista = (m.clasificaciones ?? []).map((id) => clasifPorId.get(Number(id))).filter(Boolean) as Clasif[];
  if (!lista.length && !m.transferencia_id && !m.es_ajuste && !m.aviso_whatsapp && !m.aviso_correo) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {m.es_ajuste && <span className="badge bg-warn-soft text-warn"><Scale className="mr-1 h-3 w-3" aria-hidden />Ajuste</span>}
      {m.transferencia_id && <span className="badge bg-primary-soft text-primary"><ArrowLeftRight className="mr-1 h-3 w-3" aria-hidden />Transferencia</span>}
      {m.aviso_whatsapp && (
        <span className={`badge ${m.aviso_whatsapp === "enviado" ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
          <MessageCircle className="mr-1 h-3 w-3" aria-hidden />WhatsApp {m.aviso_whatsapp}
        </span>
      )}
      {m.aviso_correo && (
        <span className={`badge ${m.aviso_correo === "enviado" ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
          <Mail className="mr-1 h-3 w-3" aria-hidden />Correo {m.aviso_correo}
        </span>
      )}
      {lista.map((c) => (
        <span key={c.id} className="badge border border-border bg-surface text-text">
          <span className="mr-1 h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />{c.nombre}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Dialogo({ titulo, refDialogo, onCerrar, children }: {
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

function Campo({ id, etiqueta, error, requerido, ayuda, className = "", children }: {
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

function DialogoMovimiento({
  cuenta, movimiento, conceptos, proveedores, clasificaciones, puedeEditar, onCerrar,
}: {
  cuenta: SaldoCuenta;
  movimiento: Movimiento | null;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  puedeEditar: boolean;
  onCerrar: () => void;
}) {
  const accion = guardarMovimiento.bind(null, cuenta.cuenta_id, movimiento?.id ?? null);
  const [estado, formAction, guardando] = useActionState<ResultadoMovimiento, FormData>(accion, {});
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const [errorBorrar, setErrorBorrar] = useState<string>();
  const dialogo = useRef<HTMLDialogElement>(null);
  const cerrar = () => dialogo.current?.close();

  useEffect(() => { if (estado.ok) dialogo.current?.close(); }, [estado.ok]);

  const m = movimiento;
  const v = estado.valores;
  const val = (k: string, porDefecto: string) => (v && typeof v[k] === "string" ? (v[k] as string) : porDefecto);
  const neto = m ? Number(m.abono) - Number(m.cargo) : 0;
  const tipoInicial = val("tipo", m ? (neto > 0 ? "abono" : "cargo") : "cargo");
  const montoInicial = val("monto", m ? String(Math.abs(neto) || Number(m.cargo) || Number(m.abono) || "") : "");
  const clasifElegidas = new Set((v?.clasificaciones as string[] | undefined) ?? (m?.clasificaciones ?? []).map(String));
  const conceptosVisibles = conceptos.filter((c) => c.activo || c.valor === String(m?.concepto_id));
  const proveedoresVisibles = proveedores.filter((p) => p.activo || p.valor === String(m?.proveedor_id));
  const clasifVisibles = clasificaciones.filter((c) => c.activo || clasifElegidas.has(String(c.id)));
  const e = estado.errores ?? {};
  const soloLectura = !puedeEditar;
  const titulo = soloLectura ? "Detalle del movimiento" : m ? "Editar movimiento" : "Nuevo movimiento";

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
            <fieldset disabled={soloLectura} className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-6">
              {m?.transferencia_id && (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary sm:col-span-6">
                  Este movimiento es parte de una transferencia. Si lo eliminas, también se elimina el movimiento de la otra cuenta.
                </p>
              )}
              {m?.es_ajuste && (
                <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn sm:col-span-6">
                  Ajuste creado al migrar del sistema anterior. {m.observaciones}
                </p>
              )}
              <Campo id="m-fecha" etiqueta="Fecha" requerido error={e.fecha} className="sm:col-span-2">
                <input id="m-fecha" name="fecha" type="date" required defaultValue={val("fecha", m?.fecha ?? hoyCDMX())} className="input" aria-invalid={!!e.fecha} />
              </Campo>
              <fieldset className="sm:col-span-2">
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
              <Campo id="m-monto" etiqueta={`Importe (${cuenta.moneda})`} requerido error={e.monto} className="sm:col-span-2">
                <input id="m-monto" name="monto" type="text" inputMode="decimal" required defaultValue={montoInicial} className="input num text-right" aria-invalid={!!e.monto} placeholder="0.00" />
              </Campo>
              <Campo id="m-desc" etiqueta="Descripción" error={e.descripcion} className="sm:col-span-6">
                <input id="m-desc" name="descripcion" type="text" defaultValue={val("descripcion", m?.descripcion ?? "")} className="input" maxLength={250} aria-invalid={!!e.descripcion} />
              </Campo>
              <Campo id="m-concepto" etiqueta="Concepto" className="sm:col-span-3">
                <Combobox id="m-concepto" nombre="concepto_id" opciones={conceptosVisibles} valorInicial={val("concepto_id", m?.concepto_id ? String(m.concepto_id) : "")} placeholder="Buscar concepto…" />
              </Campo>
              <Campo id="m-proveedor" etiqueta="Proveedor / a favor de" className="sm:col-span-3">
                <Combobox id="m-proveedor" nombre="proveedor_id" opciones={proveedoresVisibles} valorInicial={val("proveedor_id", m?.proveedor_id ? String(m.proveedor_id) : "")} placeholder="Buscar proveedor…" />
              </Campo>
              <Campo id="m-ref" etiqueta="Referencia / cheque" className={cuenta.moneda === "MXN" ? "sm:col-span-6" : "sm:col-span-3"}>
                <input id="m-ref" name="referencia" type="text" defaultValue={val("referencia", m?.referencia ?? "")} className="input" maxLength={100} />
              </Campo>
              {cuenta.moneda !== "MXN" ? (
                <Campo id="m-tc" etiqueta="Tipo de cambio" error={e.tipo_cambio} className="sm:col-span-3" ayuda={`Pesos por 1 ${cuenta.moneda}`}>
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
                <textarea id="m-obs" name="observaciones" rows={2} defaultValue={val("observaciones", m?.es_ajuste ? m.observaciones ?? "" : m?.observaciones ?? "")} className="input" />
              </Campo>
              <details className="sm:col-span-6" open={!!(m?.leyenda1 || m?.leyenda2 || m?.leyenda3)}>
                <summary className="cursor-pointer text-sm font-medium text-primary">Datos del banco (leyendas)</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo id="m-l1" etiqueta="Leyenda 1"><input id="m-l1" name="leyenda1" type="text" defaultValue={val("leyenda1", m?.leyenda1 ?? "")} className="input" maxLength={255} /></Campo>
                  <Campo id="m-l2" etiqueta="Leyenda 2"><input id="m-l2" name="leyenda2" type="text" defaultValue={val("leyenda2", m?.leyenda2 ?? "")} className="input" maxLength={255} /></Campo>
                  <Campo id="m-l3" etiqueta="Leyenda 3" className="sm:col-span-2"><textarea id="m-l3" name="leyenda3" rows={2} defaultValue={val("leyenda3", m?.leyenda3 ?? "")} className="input" maxLength={500} /></Campo>
                </div>
              </details>
            </fieldset>

            {(estado.error || errorBorrar) && (
              <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errorBorrar ?? estado.error}</p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {m && puedeEditar && (confirmarBorrar ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-danger">¿Eliminar{m.transferencia_id ? " la transferencia completa" : ""}?</span>
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
                <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={cerrar}>{soloLectura ? "Cerrar" : "Cancelar"}</button>
                {!soloLectura && (
                  <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
                )}
              </div>
            </div>
          </form>
    </Dialogo>
  );
}

function DialogoTransferencia({ cuenta, cuentas, conceptos, onCerrar }: {
  cuenta: SaldoCuenta; cuentas: CuentaCorta[]; conceptos: Opcion[]; onCerrar: () => void;
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
                Se registra un cargo en <strong className="text-text">{cuenta.nombre}</strong> y un abono en la cuenta destino.
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
              <Campo id="t-desc" etiqueta="Descripción" className="sm:col-span-2">
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
