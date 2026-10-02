"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, ChevronRight, FileText, FileUp, Loader2, RotateCcw, Sparkles, Trash2, XCircle,
} from "lucide-react";
import Combobox from "@/components/Combobox";
import type { Opcion } from "@/components/movimientos/DialogoMovimiento";
import type { Clasif } from "@/components/movimientos/TablaMovimientos";
import { createClient } from "@/lib/supabase/client";
import { dinero, fecha } from "@/lib/formato";
import type { Analisis, FilaImportacion } from "@/lib/importador/esquema";
import { cuadrar } from "@/lib/importador/analisis";
import type { CuentaCorta } from "@/lib/transacciones";
import { abrirImportacion, analizarArchivo, descartarImportacion, importarMovimientos } from "./actions";

export type ImportacionResumen = {
  id: number; archivo_nombre: string; archivo_tipo: string; estado: string; error: string | null; cuenta_id: number | null;
  banco: string | null; periodo_inicio: string | null; periodo_fin: string | null; movimientos_importados: number; created_at: string;
};

type Fila = FilaImportacion & { incluir: boolean };
type Fase =
  | { tipo: "inicio" }
  | { tipo: "trabajando"; mensaje: string }
  | { tipo: "vista"; analisis: Analisis }
  | { tipo: "listo"; cuenta: CuentaCorta; importados: number };

async function huellaArchivo(archivo: File) {
  try {
    const hash = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  leyendo: { texto: "Leyendo…", clase: "bg-surface-2 text-muted" },
  leido: { texto: "Pendiente de importar", clase: "bg-warn-soft text-warn" },
  error: { texto: "Error", clase: "bg-danger-soft text-danger" },
  importado: { texto: "Importado", clase: "bg-ok-soft text-ok" },
};

export default function ImportarVista({ usuarioId, cuentas, historial, conceptos, proveedores }: {
  usuarioId: string;
  cuentas: CuentaCorta[];
  historial: ImportacionResumen[];
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string>();
  const [encima, setEncima] = useState(false);
  const [version, setVersion] = useState(0);
  const [importando, startImportar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const nombreCuenta = useMemo(() => new Map(cuentas.map((c) => [c.cuenta_id, c])), [cuentas]);

  function mostrar(a: Analisis, previas?: Fila[]) {
    const antes = new Map((previas ?? []).map((f) => [f.indice, f]));
    setFilas(a.filas.map((f) => {
      const v = antes.get(f.indice);
      // Al cambiar de cuenta se conservan las correcciones que ya hizo el usuario
      const base = v ? {
        ...f, fecha: v.fecha, descripcion: v.descripcion, cargo: v.cargo, abono: v.abono,
        proveedor_id: v.proveedor_id || f.proveedor_id, concepto_id: v.concepto_id || f.concepto_id,
      } : f;
      return { ...base, incluir: f.estado === "nuevo" };
    }));
    setVersion((v) => v + 1);
    setFase({ tipo: "vista", analisis: a });
  }

  async function procesar(archivo: File) {
    setError(undefined);
    const ext = archivo.name.toLowerCase().endsWith(".xml") ? "xml" : archivo.name.toLowerCase().endsWith(".pdf") ? "pdf" : null;
    if (!ext) { setError("Solo se aceptan archivos PDF o XML."); return; }
    if (archivo.size > 32 * 1024 * 1024) { setError("El archivo pesa más de 32 MB."); return; }
    setFase({ tipo: "trabajando", mensaje: "Subiendo el archivo…" });
    const huella = await huellaArchivo(archivo);
    const ruta = `${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: e } = await createClient().storage.from("estados").upload(ruta, archivo, {
      contentType: ext === "pdf" ? "application/pdf" : "text/xml", upsert: false,
    });
    if (e) { setError(`No se pudo subir el archivo (${e.message}).`); setFase({ tipo: "inicio" }); return; }
    setFase({ tipo: "trabajando", mensaje: "La IA está leyendo tu estado de cuenta. Puede tardar 1 o 2 minutos…" });
    const r = await analizarArchivo(ruta, archivo.name, ext, huella);
    if (r.error || !r.analisis) { setError(r.error ?? "No se pudo leer el archivo."); setFase({ tipo: "inicio" }); router.refresh(); return; }
    mostrar(r.analisis);
    router.refresh();
  }

  async function reabrir(id: number, cuentaId?: number | null) {
    setError(undefined);
    setFase({ tipo: "trabajando", mensaje: cuentaId === undefined ? "Abriendo…" : "Revisando duplicados en la cuenta…" });
    const previas = cuentaId === undefined ? undefined : filas;
    const r = await abrirImportacion(id, cuentaId);
    if (r.error || !r.analisis) { setError(r.error ?? "No se pudo abrir."); setFase({ tipo: "inicio" }); return; }
    mostrar(r.analisis, previas);
  }

  const cambiar = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.indice === i ? { ...f, ...cambios } : f)));

  if (fase.tipo === "trabajando") {
    return (
      <div className="card flex flex-col items-center gap-3 p-12 text-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="font-medium">{fase.mensaje}</p>
      </div>
    );
  }

  if (fase.tipo === "listo") {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-ok" aria-hidden />
        <p className="text-lg font-semibold">Se importaron {fase.importados} movimientos a {fase.cuenta.nombre}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/transacciones/${fase.cuenta.cuenta_id}`} className="btn-primary">Ver la cuenta</Link>
          <button className="btn-secondary" onClick={() => setFase({ tipo: "inicio" })}>Importar otro</button>
        </div>
      </div>
    );
  }

  if (fase.tipo === "vista") {
    return <VistaPrevia key={version} analisis={fase.analisis} filas={filas} cuentas={cuentas} nombreCuenta={nombreCuenta}
      conceptos={conceptos} proveedores={proveedores} cambiar={cambiar} setFilas={setFilas} error={error}
      importando={importando}
      onCuenta={(c) => reabrir(fase.analisis.importacionId, c)}
      onCancelar={() => { setFase({ tipo: "inicio" }); setError(undefined); router.refresh(); }}
      onDescartar={() => startImportar(async () => { await descartarImportacion(fase.analisis.importacionId); setFase({ tipo: "inicio" }); router.refresh(); })}
      onImportar={() => startImportar(async () => {
        const cuentaId = fase.analisis.cuentaId;
        if (!cuentaId) { setError("Elige la cuenta."); return; }
        const elegidas = filas.filter((f) => f.incluir).map((f) => ({
          fecha: f.fecha, descripcion: f.descripcion, detalle: f.detalle, contraparte: f.contraparte, referencia: f.referencia,
          cargo: f.cargo, abono: f.abono, proveedor_id: f.proveedor_id, concepto_id: f.concepto_id,
        }));
        const r = await importarMovimientos(fase.analisis.importacionId, cuentaId, elegidas);
        if (r.error) { setError(r.error); return; }
        setFase({ tipo: "listo", cuenta: nombreCuenta.get(cuentaId)!, importados: r.importados ?? elegidas.length });
        router.refresh();
      })} />;
  }

  return (
    <div className="space-y-6">
      <section
        className={`card flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition-colors ${encima ? "border-primary bg-primary-soft" : "border-border"}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setEncima(true); } }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); const f = e.dataTransfer.files[0]; if (f) procesar(f); }}
        aria-label="Subir estado de cuenta"
      >
        <FileUp className="h-10 w-10 text-primary" aria-hidden />
        <p className="font-medium">Arrastra aquí el estado de cuenta (PDF o XML)</p>
        <p className="text-sm text-muted">La IA detecta el banco, la cuenta, el periodo y todos los movimientos.</p>
        <input ref={entrada} type="file" accept=".pdf,.xml,application/pdf,text/xml" className="sr-only" id="archivo-estado"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ""; }} />
        <label htmlFor="archivo-estado" className="btn-primary cursor-pointer">Elegir archivo</label>
        <p className="max-w-xl text-xs text-muted">
          En Banamex, el XML solo trae las comisiones e intereses del periodo (es la factura); los movimientos completos vienen en el PDF.
        </p>
      </section>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {historial.length > 0 && (
        <section aria-labelledby="hist">
          <h2 id="hist" className="mb-2 font-semibold">Archivos recientes</h2>
          <ul className="card divide-y divide-border">
            {historial.map((h) => {
              const est = ESTADOS[h.estado] ?? ESTADOS.leyendo;
              const cuenta = h.cuenta_id ? nombreCuenta.get(h.cuenta_id) : undefined;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.archivo_nombre}</p>
                    <p className="truncate text-xs text-muted">
                      {[h.banco, cuenta?.nombre, h.periodo_inicio && h.periodo_fin ? `${fecha(h.periodo_inicio)} – ${fecha(h.periodo_fin)}` : null,
                        new Date(h.created_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" })]
                        .filter(Boolean).join(" · ")}
                      {h.estado === "error" && h.error ? ` · ${h.error.slice(0, 120)}` : ""}
                    </p>
                  </div>
                  <span className={`badge ${est.clase}`}>{est.texto}{h.estado === "importado" ? ` · ${h.movimientos_importados}` : ""}</span>
                  {h.estado === "leido" && <button className="btn-secondary px-3 py-1.5" onClick={() => reabrir(h.id)}>Continuar <ChevronRight className="h-4 w-4" aria-hidden /></button>}
                  {h.estado === "importado" && h.cuenta_id && <Link className="btn-ghost px-3 py-1.5" href={`/transacciones/${h.cuenta_id}`}>Ver cuenta</Link>}
                  {(h.estado === "error" || h.estado === "leido") && (
                    <button className="btn-ghost p-1.5 text-muted" aria-label={`Quitar ${h.archivo_nombre}`}
                      onClick={async () => { await descartarImportacion(h.id); router.refresh(); }}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Vista previa ----------------------------------------------------------
const FECHA_OK = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));
const elegidas_ = (fs: Fila[]) => fs.filter((f) => f.incluir);

// Importe editable: se escribe libre y se guarda como número (vacío = 0)
function Importe({ valor, onCambio, clase, etiqueta }: { valor: number; onCambio: (v: number) => void; clase: string; etiqueta: string }) {
  const [texto, setTexto] = useState(valor ? valor.toFixed(2) : "");
  const [editando, setEditando] = useState(false);
  const mostrado = editando ? texto : valor ? valor.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  return (
    <input inputMode="decimal" className={`input num w-28 py-1 text-right ${clase}`} value={mostrado} placeholder="0.00" aria-label={etiqueta}
      onFocus={() => { setTexto(valor ? valor.toFixed(2) : ""); setEditando(true); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, "");
        setTexto(t);
        const n = Math.round((Number(t) || 0) * 100) / 100;
        onCambio(n);
      }}
      onBlur={() => setEditando(false)} />
  );
}
function VistaPrevia({
  analisis, filas, cuentas, nombreCuenta, conceptos, proveedores, cambiar, setFilas, error, importando,
  onCuenta, onCancelar, onDescartar, onImportar,
}: {
  analisis: Analisis; filas: Fila[]; cuentas: CuentaCorta[]; nombreCuenta: Map<number, CuentaCorta>;
  conceptos: Opcion[]; proveedores: Opcion[];
  cambiar: (i: number, c: Partial<Fila>) => void; setFilas: React.Dispatch<React.SetStateAction<Fila[]>>;
  error?: string; importando: boolean;
  onCuenta: (c: number | null) => void; onCancelar: () => void; onDescartar: () => void; onImportar: () => void;
}) {
  const d = analisis.datos;
  // El cuadre se recalcula al corregir importes en la vista previa
  const { cuadre: c, saldosOk } = useMemo(() => cuadrar({ ...d, movimientos: filas }), [d, filas]);
  const sinImporte = elegidas_(filas).filter((f) => !f.cargo && !f.abono).length;
  const fechaMala = elegidas_(filas).filter((f) => !FECHA_OK(f.fecha)).length;
  const cuenta = analisis.cuentaId ? nombreCuenta.get(analisis.cuentaId) : undefined;
  const moneda = cuenta?.moneda ?? d.moneda ?? "MXN";
  const elegidas = filas.filter((f) => f.incluir);
  const cuenta_ = (estado: Fila["estado"]) => filas.filter((f) => f.estado === estado).length;
  const tc = d.tipo_producto === "tarjeta_credito";
  const prov = useMemo(() => proveedores.filter((p) => p.activo), [proveedores]);
  const conc = useMemo(() => conceptos.filter((p) => p.activo), [conceptos]);

  return (
    <div className="space-y-4 pb-24">
      <section className="card grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm text-muted"><FileText className="h-4 w-4" aria-hidden /> {analisis.archivoNombre}</p>
          <p className="text-lg font-semibold">{d.banco} · {d.nombre_producto}</p>
          <p className="text-sm text-muted">
            {d.terminacion ? `Terminación ${d.terminacion} · ` : ""}{tc ? "Tarjeta de crédito" : "Cuenta"}
            {d.periodo_inicio && d.periodo_fin ? ` · ${fecha(d.periodo_inicio)} al ${fecha(d.periodo_fin)}` : ""}
          </p>
        </div>
        <div>
          <label htmlFor="imp-cuenta" className="label">Cuenta donde se importan</label>
          <select id="imp-cuenta" className={`input ${analisis.cuentaId ? "" : "border-danger"}`} value={analisis.cuentaId ?? ""} onChange={(e) => onCuenta(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elige la cuenta…</option>
            {cuentas.map((x) => <option key={x.cuenta_id} value={x.cuenta_id}>{x.nombre} ({x.moneda})</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">
            {analisis.cuentaDetectada ? "Detectada por su terminación." : analisis.cuentaId ? "Al importar, la cuenta recordará esta terminación." : d.terminacion ? `No hay una cuenta con terminación ${d.terminacion}; elígela y la recordará.` : "Elige la cuenta."}
          </p>
        </div>
        <div className={`rounded-lg p-3 text-sm ${!c.aplica ? "bg-surface-2" : c.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`} data-cuadre={c.ok ? "ok" : "no"}>
          <p className="flex items-center gap-1.5 font-semibold">
            {c.aplica ? (c.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />) : <AlertTriangle className="h-4 w-4" aria-hidden />}
            {!c.aplica ? "Sin saldos para cuadrar" : c.ok ? "Los saldos cuadran" : "Los saldos no cuadran"}
          </p>
          {c.aplica && (
            <p className="mt-1 num text-xs">
              {dinero(c.saldoInicial, moneda)} {tc ? "+ cargos − abonos" : "+ abonos − cargos"} = {dinero(c.calculado, moneda)}
              {" · "}estado de cuenta: {dinero(c.saldoFinal, moneda)}
              {!c.ok && ` · diferencia ${dinero(c.diferencia, moneda)}`}
            </p>
          )}
          <p className="mt-1 num text-xs">Cargos {dinero(c.cargos, moneda)} · Abonos {dinero(c.abonos, moneda)}</p>
        </div>
      </section>

      {analisis.yaImportado && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn"><AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />{analisis.yaImportado}</p>}
      {d.notas && <p className="rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary"><Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden />Nota de la IA: {d.notas}</p>}
      {!c.ok && c.aplica && (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          Revisa los renglones marcados con <XCircle className="inline h-3.5 w-3.5" aria-label="saldo no cuadra" />: ahí el saldo del banco no coincide. Puede faltar o sobrar un movimiento.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span><strong>{filas.length}</strong> movimientos</span>
        <span className="text-ok">{cuenta_("nuevo")} nuevos</span>
        <span className="text-muted">{cuenta_("duplicado")} ya existen</span>
        {cuenta_("posible") > 0 && <span className="text-warn">{cuenta_("posible")} posibles duplicados</span>}
        <span className="ml-auto flex gap-2">
          <button className="btn-ghost px-2 py-1" onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, incluir: f.estado === "nuevo" })))}>Solo nuevos</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, incluir: true })))}>Todos</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, incluir: false })))}>Ninguno</button>
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2"><span className="sr-only">Importar</span></th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Movimiento</th>
              <th className="px-3 py-2 text-right font-medium">Cargo</th>
              <th className="px-3 py-2 text-right font-medium">Abono</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="min-w-48 px-3 py-2 font-medium">A favor de</th>
              <th className="min-w-48 px-3 py-2 font-medium">Concepto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f, n) => (
              <tr key={f.indice} className={`align-top ${!f.incluir ? "opacity-55" : ""}`} data-estado={f.estado}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(f.indice, { incluir: e.target.checked })}
                    className="h-4 w-4 accent-[var(--primary)]" aria-label={`Importar ${f.descripcion}`} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" className={`input w-36 py-1 ${FECHA_OK(f.fecha) ? "" : "border-danger"}`} value={FECHA_OK(f.fecha) ? f.fecha : ""}
                    onChange={(e) => cambiar(f.indice, { fecha: e.target.value })} aria-label="Fecha" aria-invalid={!FECHA_OK(f.fecha)} />
                </td>
                <td className="min-w-60 max-w-[26rem] px-3 py-2">
                  <input className="input py-1" value={f.descripcion} onChange={(e) => cambiar(f.indice, { descripcion: e.target.value })} aria-label="Descripción" />
                  <p className="mt-1 line-clamp-2 text-xs text-muted" title={f.detalle}>{[f.contraparte, f.detalle].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-3 py-2">
                  <Importe valor={f.cargo} clase="text-danger" etiqueta="Cargo"
                    onCambio={(v) => cambiar(f.indice, v ? { cargo: v, abono: 0 } : { cargo: 0 })} />
                </td>
                <td className="px-3 py-2">
                  <Importe valor={f.abono} clase="text-ok" etiqueta="Abono"
                    onCambio={(v) => cambiar(f.indice, v ? { abono: v, cargo: 0 } : { abono: 0 })} />
                  {!f.cargo && !f.abono && <p className="mt-1 text-right text-xs text-muted">Sin importe ($0)</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {f.estado === "nuevo" ? <span className="badge bg-ok-soft text-ok">Nuevo</span>
                    : f.estado === "duplicado" ? <span className="badge bg-surface-2 text-muted" title={`Ya existe: folio ${f.coincide?.folio}`}>Ya existe · folio {f.coincide?.folio}</span>
                      : <span className="badge bg-warn-soft text-warn" title={`Mismo importe el ${fecha(f.coincide?.fecha)}`}>¿Duplicado? folio {f.coincide?.folio}</span>}
                  {saldosOk[n] === false && <span className="mt-1 flex items-center gap-1 text-xs text-danger"><XCircle className="h-3.5 w-3.5" aria-hidden /> Saldo no cuadra</span>}
                </td>
                <td className="px-3 py-2">
                  <Combobox nombre={`p${f.indice}`} opciones={prov} valorInicial={f.proveedor_id} placeholder="—"
                    onCambio={(v) => cambiar(f.indice, { proveedor_id: v })} />
                  {f.sugerencia && f.proveedor_id && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Sparkles className="h-3 w-3" aria-hidden /> Sugerido</p>}
                </td>
                <td className="px-3 py-2">
                  <Combobox nombre={`c${f.indice}`} opciones={conc} valorInicial={f.concepto_id} placeholder="—"
                    onCambio={(v) => cambiar(f.indice, { concepto_id: v })} />
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">La IA no encontró movimientos en este archivo.</td></tr>}
          </tbody>
        </table>
      </div>

      {(sinImporte > 0 || fechaMala > 0) && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn" data-aviso-revisar>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
          {fechaMala > 0 && <>{fechaMala} movimiento(s) sin fecha válida: corrígela en la tabla para poder importar. </>}
          {sinImporte > 0 && <>{sinImporte} movimiento(s) van sin importe ($0). Si es correcto (por ejemplo, una exención de comisión) puedes importarlos así; si no, escribe el cargo o abono en la tabla o quítales la palomita.</>}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <p className="text-sm">
            <strong>{elegidas.length}</strong> por importar
            <span className="num ml-2 text-muted">
              cargos {dinero(elegidas.reduce((s, f) => s + f.cargo, 0), moneda)} · abonos {dinero(elegidas.reduce((s, f) => s + f.abono, 0), moneda)}
            </span>
          </p>
          {!importando && (!analisis.cuentaId || fechaMala > 0 || !elegidas.length) && (
            <p className="text-sm font-medium text-danger" data-motivo>
              {!analisis.cuentaId ? "Elige arriba la cuenta donde se importan." : fechaMala > 0 ? "Corrige las fechas marcadas en rojo." : "Marca al menos un movimiento."}
            </p>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={onCancelar} disabled={importando}><RotateCcw className="h-4 w-4" aria-hidden /> Después</button>
            <button className="btn-ghost text-danger" onClick={onDescartar} disabled={importando}><Trash2 className="h-4 w-4" aria-hidden /> Descartar</button>
            <button className="btn-primary" onClick={onImportar} disabled={importando || !elegidas.length || !analisis.cuentaId || fechaMala > 0}>
              {importando ? "Importando…" : `Importar ${elegidas.length} a ${cuenta?.nombre ?? "…"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
