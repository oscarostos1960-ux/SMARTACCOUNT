"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Copy, FileText, FileUp, Loader2, RotateCcw, Sparkles, Trash2, XCircle,
} from "lucide-react";
import Combobox from "@/components/Combobox";
import type { Opcion } from "@/components/movimientos/DialogoMovimiento";
import type { Clasif } from "@/components/movimientos/TablaMovimientos";
import { createClient } from "@/lib/supabase/client";
import { dinero, fecha } from "@/lib/formato";
import type { Analisis, FilaImportacion, ResumenLectura } from "@/lib/importador/esquema";
import { cuadrar, esParecido } from "@/lib/importador/analisis";
import type { CuentaCorta } from "@/lib/transacciones";
import { abrirImportacion, analizarArchivo, descartarImportacion, importarMovimientos } from "./actions";

export type ImportacionResumen = {
  id: number; archivo_nombre: string; archivo_tipo: string; estado: string; error: string | null; cuenta_id: number | null;
  banco: string | null; periodo_inicio: string | null; periodo_fin: string | null; movimientos_importados: number; created_at: string;
};

type Fila = FilaImportacion & { incluir: boolean };
type ItemLote = {
  clave: string; nombre: string; archivo: File;
  estado: "esperando" | "subiendo" | "leyendo" | "listo" | "error" | "importado" | "descartado";
  error?: string; resumen?: ResumenLectura; importados?: number;
};
type Fase =
  | { tipo: "inicio" }
  | { tipo: "lote" }
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
  const [lote, setLote] = useState<ItemLote[] | null>(null);
  const [llenados, setLlenados] = useState<string>();
  const [cuentaLote, setCuentaLote] = useState<number | null>(null);
  const [actual, setActual] = useState<string | null>(null);   // archivo del lote que se está revisando
  const cambiarItem = (clave: string, c: Partial<ItemLote>) => setLote((l) => l && l.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  const extension = (n: string) => (n.toLowerCase().endsWith(".xml") ? "xml" : n.toLowerCase().endsWith(".pdf") ? "pdf" : null);

  // Varios archivos: se suben y se leen de 4 en 4 al mismo tiempo
  async function procesarVarios(archivos: File[]) {
    setError(undefined);
    const validos = archivos.filter((a) => extension(a.name) && a.size <= 32 * 1024 * 1024);
    if (validos.length < archivos.length) setError(`Se omitieron ${archivos.length - validos.length} archivo(s): solo PDF o XML de hasta 32 MB.`);
    if (!validos.length) return;
    const items: ItemLote[] = validos.map((a, i) => ({ clave: `${Date.now()}-${i}`, nombre: a.name, archivo: a, estado: "esperando" }));
    setLote(items);
    setCuentaLote(null);
    setFase({ tipo: "lote" });
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < items.length) {
        const it = items[siguiente++];
        await leerUno(it);
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
    router.refresh();
  }

  async function leerUno(it: ItemLote) {
    const ext = extension(it.nombre)!;
    cambiarItem(it.clave, { estado: "subiendo" });
    const huella = await huellaArchivo(it.archivo);
    const ruta = `${usuarioId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: e } = await createClient().storage.from("estados").upload(ruta, it.archivo, {
      contentType: ext === "pdf" ? "application/pdf" : "text/xml", upsert: false,
    });
    if (e) { cambiarItem(it.clave, { estado: "error", error: `No se pudo subir (${e.message}).` }); return; }
    cambiarItem(it.clave, { estado: "leyendo" });
    try {
      const resp = await fetch("/importar/leer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta, nombre: it.nombre, tipo: ext, huella }),
      });
      const j = await resp.json().catch(() => ({ error: resp.status === 504 ? "La lectura tardó demasiado." : `Error del servidor (${resp.status}).` }));
      if (j.resumen) {
        cambiarItem(it.clave, { estado: "listo", resumen: j.resumen });
        setCuentaLote((c) => c ?? j.resumen.cuentaId ?? null);
      } else cambiarItem(it.clave, { estado: "error", error: j.error ?? "No se pudo leer." });
    } catch {
      cambiarItem(it.clave, { estado: "error", error: "Se perdió la conexión mientras se leía." });
    }
  }

  // Abre la vista previa de un archivo del lote, ya con la cuenta elegida
  async function revisarDelLote(it: ItemLote) {
    if (!it.resumen) return;
    setActual(it.clave);
    await reabrir(it.resumen.id, cuentaLote ?? undefined);
  }
  const pendientesLote = (lote ?? []).filter((x) => x.estado === "listo")
    .sort((a, b) => (a.resumen?.periodo_inicio ?? "").localeCompare(b.resumen?.periodo_inicio ?? ""));

  function mostrar(a: Analisis, previas?: Fila[]) {
    setLlenados(undefined);
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

  async function reabrir(id: number, cuentaId?: number | null, conservar = false) {
    setError(undefined);
    setFase({ tipo: "trabajando", mensaje: cuentaId === undefined ? "Abriendo…" : "Revisando duplicados en la cuenta…" });
    const previas = conservar ? filas : undefined;
    const r = await abrirImportacion(id, cuentaId);
    if (r.error || !r.analisis) { setError(r.error ?? "No se pudo abrir."); setFase({ tipo: lote ? "lote" : "inicio" }); return; }
    mostrar(r.analisis, previas);
  }

  function elegir(archivos: File[]) {
    if (archivos.length === 1) { setLote(null); procesar(archivos[0]); }
    else if (archivos.length > 1) procesarVarios(archivos);
  }

  const cambiar = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.indice === i ? { ...f, ...cambios } : f)));

  // Al elegir "A favor de" o "Concepto", se llenan igual los renglones parecidos que estén vacíos
  function asignar(i: number, campo: "proveedor_id" | "concepto_id", valor: string) {
    // Comisión bancaria: el "A favor de" es siempre el banco que la cobra
    const regla = fase.tipo === "vista" ? fase.analisis.regla : undefined;
    if (campo === "concepto_id" && regla?.proveedorBanco && regla.conceptoComision && Number(valor) === regla.conceptoComision) {
      const banco = String(regla.proveedorBanco);
      const nuevas = filas.map((f) => {
        const misma = f.indice === i || (!f.concepto_id && esParecido(filas.find((x) => x.indice === i)!, f));
        return misma ? { ...f, concepto_id: valor, proveedor_id: banco, copiado: f.indice !== i, rev: (f.rev ?? 0) + 1 } : f;
      });
      setFilas(nuevas);
      setLlenados("Comisión bancaria: el \"A favor de\" se puso como el banco que la cobra.");
      return;
    }
    const origen = filas.find((f) => f.indice === i);
    let n = 0;
    const nuevas = filas.map((f) => {
      if (f.indice === i) return { ...f, [campo]: valor, copiado: false };
      if (!valor || !origen || f[campo] || !esParecido(origen, f)) return f;
      n++;
      return { ...f, [campo]: valor, copiado: true, rev: (f.rev ?? 0) + 1 };
    });
    setFilas(nuevas);
    setLlenados(n ? `Se llenaron ${n} renglón(es) parecido(s) con lo mismo. Revísalos antes de importar.` : undefined);
  }


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
        {lote && pendientesLote.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => revisarDelLote(pendientesLote[0])}>
              Seguir con el siguiente ({pendientesLote[0].resumen?.periodo_inicio ? fecha(pendientesLote[0].resumen.periodo_inicio) : pendientesLote[0].nombre}) <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button className="btn-secondary" onClick={() => setFase({ tipo: "lote" })}>Ver la lista</button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/transacciones/${fase.cuenta.cuenta_id}`} className="btn-primary">Ver la cuenta</Link>
            <button className="btn-secondary" onClick={() => { setLote(null); setFase({ tipo: "inicio" }); }}>Importar otro</button>
            {lote && <button className="btn-ghost" onClick={() => setFase({ tipo: "lote" })}>Ver la lista</button>}
          </div>
        )}
      </div>
    );
  }

  if (fase.tipo === "vista") {
    return <VistaPrevia key={version} analisis={fase.analisis} filas={filas} cuentas={cuentas} nombreCuenta={nombreCuenta}
      conceptos={conceptos} proveedores={proveedores} cambiar={cambiar} asignar={asignar} llenados={llenados} setFilas={setFilas} error={error}
      importando={importando}
      onCuenta={(c) => { if (lote) setCuentaLote(c); reabrir(fase.analisis.importacionId, c, true); }}
      onCancelar={() => { setFase({ tipo: lote ? "lote" : "inicio" }); setError(undefined); router.refresh(); }}
      onDescartar={() => startImportar(async () => {
        await descartarImportacion(fase.analisis.importacionId);
        if (lote && actual) { cambiarItem(actual, { estado: "descartado" }); setFase({ tipo: "lote" }); } else setFase({ tipo: "inicio" });
        router.refresh();
      })}
      onImportar={() => startImportar(async () => {
        const cuentaId = fase.analisis.cuentaId;
        if (!cuentaId) { setError("Elige la cuenta."); return; }
        const elegidas = filas.filter((f) => f.incluir).map((f) => ({
          fecha: f.fecha, descripcion: f.descripcion, detalle: f.detalle, contraparte: f.contraparte, referencia: f.referencia,
          cargo: f.cargo, abono: f.abono, proveedor_id: f.proveedor_id, concepto_id: f.concepto_id,
        }));
        const r = await importarMovimientos(fase.analisis.importacionId, cuentaId, elegidas);
        if (r.error) { setError(r.error); return; }
        if (lote && actual) { cambiarItem(actual, { estado: "importado", importados: r.importados ?? elegidas.length }); setCuentaLote(cuentaId); }
        setFase({ tipo: "listo", cuenta: nombreCuenta.get(cuentaId)!, importados: r.importados ?? elegidas.length });
        router.refresh();
      })} />;
  }

  if (fase.tipo === "lote" && lote) {
    return <VistaLote lote={lote} cuentas={cuentas} cuentaLote={cuentaLote} setCuentaLote={setCuentaLote} error={error}
      onRevisar={revisarDelLote} siguiente={pendientesLote[0]}
      onTerminar={() => { setLote(null); setFase({ tipo: "inicio" }); setError(undefined); router.refresh(); }} />;
  }

  return (
    <div className="space-y-6">
      <section
        className={`card flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition-colors ${encima ? "border-primary bg-primary-soft" : "border-border"}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setEncima(true); } }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); elegir([...e.dataTransfer.files]); }}
        aria-label="Subir estado de cuenta"
      >
        <FileUp className="h-10 w-10 text-primary" aria-hidden />
        <p className="font-medium">Arrastra aquí el estado de cuenta (PDF o XML)</p>
        <p className="text-sm text-muted">Puedes soltar <strong>varios meses de la misma cuenta</strong> a la vez: se leen al mismo tiempo y luego los revisas uno por uno.</p>
        <p className="text-sm text-muted">La IA detecta el banco, la cuenta, el periodo y todos los movimientos.</p>
        <input ref={entrada} type="file" multiple accept=".pdf,.xml,application/pdf,text/xml" className="sr-only" id="archivo-estado"
          onChange={(e) => { elegir([...(e.target.files ?? [])]); e.target.value = ""; }} />
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
  analisis, filas, cuentas, nombreCuenta, conceptos, proveedores, cambiar, asignar, llenados, setFilas, error, importando,
  onCuenta, onCancelar, onDescartar, onImportar,
}: {
  analisis: Analisis; filas: Fila[]; cuentas: CuentaCorta[]; nombreCuenta: Map<number, CuentaCorta>;
  conceptos: Opcion[]; proveedores: Opcion[];
  cambiar: (i: number, c: Partial<Fila>) => void;
  asignar: (i: number, campo: "proveedor_id" | "concepto_id", valor: string) => void; llenados?: string;
  setFilas: React.Dispatch<React.SetStateAction<Fila[]>>;
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
                  <Combobox key={`p${f.indice}-${f.rev ?? 0}`} nombre={`p${f.indice}`} opciones={prov} valorInicial={f.proveedor_id} placeholder="—"
                    onCambio={(v) => asignar(f.indice, "proveedor_id", v)} />
                  {f.copiado && f.proveedor_id ? <p className="mt-1 flex items-center gap-1 text-xs text-primary" data-copiado><Copy className="h-3 w-3" aria-hidden /> Igual que otro renglón</p>
                    : f.sugerencia && f.proveedor_id && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Sparkles className="h-3 w-3" aria-hidden /> Sugerido</p>}
                </td>
                <td className="px-3 py-2">
                  <Combobox key={`c${f.indice}-${f.rev ?? 0}`} nombre={`c${f.indice}`} opciones={conc} valorInicial={f.concepto_id} placeholder="—"
                    onCambio={(v) => asignar(f.indice, "concepto_id", v)} />
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">La IA no encontró movimientos en este archivo.</td></tr>}
          </tbody>
        </table>
      </div>

      {llenados && (
        <p className="sticky bottom-20 z-20 rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary shadow" role="status" data-llenados>
          <Copy className="mr-1.5 inline h-4 w-4" aria-hidden />{llenados}
        </p>
      )}
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

// ---------- Varios estados de cuenta ------------------------------------------------
const ETIQUETA_LOTE: Record<ItemLote["estado"], { texto: string; clase: string }> = {
  esperando: { texto: "En espera", clase: "bg-surface-2 text-muted" },
  subiendo: { texto: "Subiendo…", clase: "bg-surface-2 text-muted" },
  leyendo: { texto: "La IA está leyendo…", clase: "bg-primary-soft text-primary" },
  listo: { texto: "Listo para revisar", clase: "bg-warn-soft text-warn" },
  error: { texto: "Error", clase: "bg-danger-soft text-danger" },
  importado: { texto: "Importado", clase: "bg-ok-soft text-ok" },
  descartado: { texto: "Descartado", clase: "bg-surface-2 text-muted" },
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

function VistaLote({ lote, cuentas, cuentaLote, setCuentaLote, error, onRevisar, siguiente, onTerminar }: {
  lote: ItemLote[]; cuentas: CuentaCorta[]; cuentaLote: number | null; setCuentaLote: (c: number | null) => void; error?: string;
  onRevisar: (it: ItemLote) => void; siguiente?: ItemLote; onTerminar: () => void;
}) {
  const leyendo = lote.filter((x) => ["esperando", "subiendo", "leyendo"].includes(x.estado)).length;
  // Orden por periodo; los que aún no se leen van al final
  const orden = [...lote].sort((a, b) => (a.resumen?.periodo_inicio ?? "9999").localeCompare(b.resumen?.periodo_inicio ?? "9999"));
  const leidos = orden.filter((x) => x.resumen);
  const terminaciones = [...new Set(leidos.map((x) => x.resumen!.terminacion).filter(Boolean))];
  const moneda = cuentas.find((c) => c.cuenta_id === cuentaLote)?.moneda ?? leidos[0]?.resumen?.moneda ?? "MXN";

  return (
    <div className="space-y-4">
      <section className="card grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
        <div>
          <p className="text-lg font-semibold">{lote.length} estados de cuenta</p>
          <p className="text-sm text-muted" role="status" data-progreso>
            {leyendo > 0 ? <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden /> Leyendo {leyendo} de {lote.length}… puedes empezar a revisar los que ya están listos.</>
              : "Lectura terminada. Revísalos del más antiguo al más reciente para que los folios queden en orden."}
          </p>
        </div>
        <div>
          <label htmlFor="lote-cuenta" className="label">Cuenta donde se importan (todos)</label>
          <select id="lote-cuenta" className={`input ${cuentaLote ? "" : "border-danger"}`} value={cuentaLote ?? ""} onChange={(e) => setCuentaLote(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elige la cuenta…</option>
            {cuentas.map((x) => <option key={x.cuenta_id} value={x.cuenta_id}>{x.nombre} ({x.moneda})</option>)}
          </select>
        </div>
      </section>

      {terminaciones.length > 1 && (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger" data-aviso-cuentas>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
          Ojo: los archivos parecen de cuentas distintas (terminaciones {terminaciones.join(", ")}). Revisa cada uno antes de importarlo.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Archivo</th>
              <th className="px-3 py-2 font-medium">Periodo</th>
              <th className="px-3 py-2 text-right font-medium">Movs.</th>
              <th className="px-3 py-2 text-right font-medium">Saldo inicial</th>
              <th className="px-3 py-2 text-right font-medium">Saldo final</th>
              <th className="px-3 py-2 font-medium">Revisión</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orden.map((it) => {
              const r = it.resumen;
              const i = leidos.indexOf(it);
              const prev = i > 0 ? leidos[i - 1].resumen! : null;
              const avisos: string[] = [];
              if (r && r.cuadra === false) avisos.push(`No cuadra (dif. ${dinero(r.diferencia, moneda)})`);
              if (r && prev && prev.saldo_final !== null && r.saldo_inicial !== null && Math.abs(prev.saldo_final - r.saldo_inicial) >= 0.015)
                avisos.push(`Su saldo inicial no es el final del anterior (${dinero(prev.saldo_final, moneda)})`);
              if (r?.periodo_inicio && prev?.periodo_fin && diasEntre(prev.periodo_fin, r.periodo_inicio) > 5)
                avisos.push("Parece que falta un estado de cuenta antes de este");
              if (r?.periodo_inicio && prev?.periodo_inicio === r.periodo_inicio) avisos.push("Periodo repetido");
              const et = ETIQUETA_LOTE[it.estado];
              return (
                <tr key={it.clave} data-lote={it.estado}>
                  <td className="max-w-64 px-3 py-2.5">
                    <p className="truncate font-medium" title={it.nombre}>{it.nombre}</p>
                    {r && <p className="truncate text-xs text-muted">{r.banco} · {r.producto}{r.terminacion ? ` · ${r.terminacion}` : ""}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r?.periodo_inicio && r.periodo_fin ? `${fecha(r.periodo_inicio)} – ${fecha(r.periodo_fin)}` : ""}</td>
                  <td className="num px-3 py-2.5 text-right">{r?.movimientos ?? ""}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right">{r ? dinero(r.saldo_inicial, moneda) : ""}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-right">{r ? dinero(r.saldo_final, moneda) : ""}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {it.estado === "error" ? <span className="text-danger">{it.error}</span>
                      : !r ? "" : avisos.length ? <ul className="space-y-0.5 text-danger">{avisos.map((a) => <li key={a} className="flex gap-1"><XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />{a}</li>)}</ul>
                        : <span className="flex items-center gap-1 text-ok"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Cuadra</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={`badge ${et.clase}`}>{et.texto}{it.estado === "importado" ? ` · ${it.importados}` : ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    {it.estado === "listo" && <button className="btn-secondary px-3 py-1.5" onClick={() => onRevisar(it)}>Revisar <ChevronRight className="h-4 w-4" aria-hidden /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {siguiente && (
          <button className="btn-primary" onClick={() => onRevisar(siguiente)} disabled={!cuentaLote}>
            Revisar el más antiguo ({siguiente.resumen?.periodo_inicio ? fecha(siguiente.resumen.periodo_inicio) : siguiente.nombre}) <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
        {siguiente && !cuentaLote && <p className="text-sm font-medium text-danger">Elige arriba la cuenta donde se importan.</p>}
        <button className="btn-ghost ml-auto" onClick={onTerminar} disabled={leyendo > 0}>
          {lote.some((x) => x.estado === "listo") ? "Terminar después" : "Terminar"}
        </button>
      </div>
      {lote.some((x) => x.estado === "listo") && <p className="text-xs text-muted">Los que no revises ahora quedan en &quot;Archivos recientes&quot; como pendientes de importar.</p>}
    </div>
  );
}
