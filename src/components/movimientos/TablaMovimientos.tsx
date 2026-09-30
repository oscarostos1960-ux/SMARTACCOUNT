"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight, ChevronLeft, ChevronRight, Columns3, Download, Loader2, Mail, MessageCircle, Paperclip, Scale,
} from "lucide-react";
import { dinero, fecha as fmtFecha } from "@/lib/formato";
import { COLUMNAS, type ClaveColumna, type Movimiento, type Totales } from "@/lib/transacciones";
import { useColumnas } from "./columnas";
import { subirArchivos } from "./Documentos";

export type Clasif = { id: number; nombre: string; color: string; activo: boolean };

export default function TablaMovimientos({
  movimientos, total, totales, pagina, porPagina, enlacePagina, enlaceExportar,
  claveColumnas, columnasPorDefecto, clasificaciones, onAbrir, acciones, vacio, puedeAdjuntar,
}: {
  movimientos: Movimiento[];
  total: number;
  totales: Totales[];
  pagina: number;
  porPagina: number;
  enlacePagina: (n: number) => string;
  enlaceExportar: (columnas: ClaveColumna[]) => string;
  claveColumnas: string;
  columnasPorDefecto: ClaveColumna[];
  clasificaciones: Clasif[];
  onAbrir: (m: Movimiento) => void;
  acciones?: React.ReactNode;
  puedeAdjuntar?: (m: Movimiento) => boolean;   // arrastrar y soltar archivos sobre un movimiento
  vacio: { titulo: string; texto?: string };
}) {
  const [columnas, setColumnas] = useColumnas(claveColumnas, columnasPorDefecto);
  const soltar = useSoltarArchivos(puedeAdjuntar);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const clasifPorId = new Map(clasificaciones.map((c) => [c.id, c]));
  const visibles = COLUMNAS.filter((c) => columnas.includes(c.clave));

  function celda(m: Movimiento, clave: ClaveColumna): React.ReactNode {
    switch (clave) {
      case "folio": return <span className="font-medium">{m.folio}</span>;
      case "fecha": return <span className="whitespace-nowrap text-muted">{fmtFecha(m.fecha)}</span>;
      case "cuenta": return <span className="whitespace-nowrap">{m.cuenta}</span>;
      case "cargo": return Number(m.cargo) > 0 ? <span className="text-danger">{dinero(m.cargo, m.moneda)}</span> : null;
      case "abono": return Number(m.abono) > 0 ? <span className="text-ok">{dinero(m.abono, m.moneda)}</span> : null;
      case "saldo": return <span className={`font-medium ${Number(m.saldo) < 0 ? "text-danger" : ""}`}>{dinero(m.saldo, m.moneda)}</span>;
      case "descripcion":
        return (
          <span>
            {m.descripcion}
            <Insignias m={m} />
          </span>
        );
      case "clasificaciones":
        return (
          <span className="flex flex-wrap gap-1">
            {(m.clasificaciones ?? []).map((id) => clasifPorId.get(Number(id))).filter(Boolean).map((c) => (
              <span key={c!.id} className="badge border border-border bg-surface text-text">
                <span className="mr-1 h-2 w-2 rounded-full" style={{ background: c!.color }} aria-hidden />{c!.nombre}
              </span>
            ))}
          </span>
        );
      case "documentos":
        return m.documentos > 0 ? (
          <span className="inline-flex items-center gap-1 text-primary" title={`${m.documentos} documento(s)`}>
            <Paperclip className="h-4 w-4" aria-hidden />{m.documentos}
            <span className="sr-only">documentos</span>
          </span>
        ) : null;
      default:
        return (m[clave] as string | null) ?? null;
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="text-muted">Movimientos:</dt><dd className="num font-medium">{total.toLocaleString("es-MX")}</dd></div>
          {totales.map((t) => (
            <div key={t.moneda} className="flex flex-wrap gap-x-3">
              <div className="flex gap-1"><dt className="text-muted">Cargos{totales.length > 1 ? ` ${t.moneda}` : ""}:</dt><dd className="num font-medium text-danger">{dinero(t.cargos, t.moneda)}</dd></div>
              <div className="flex gap-1"><dt className="text-muted">Abonos{totales.length > 1 ? ` ${t.moneda}` : ""}:</dt><dd className="num font-medium text-ok">{dinero(t.abonos, t.moneda)}</dd></div>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <SelectorColumnas columnas={columnas} onCambio={setColumnas} />
          {total > 0 && (
            <a href={enlaceExportar(columnas)} className="btn-secondary" download>
              <Download className="h-4 w-4" aria-hidden /> Excel
            </a>
          )}
          {acciones}
        </div>
      </div>

      {puedeAdjuntar && movimientos.length > 0 && (
        <p className="mb-2 hidden items-center gap-1.5 text-xs text-muted md:flex">
          <Paperclip className="h-3.5 w-3.5" aria-hidden /> Para adjuntar un documento, arrástralo y suéltalo sobre el movimiento.
        </p>
      )}
      {soltar.aviso && (
        <p role="status" className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${soltar.aviso.tipo === "error" ? "bg-danger-soft text-danger" : soltar.aviso.tipo === "ok" ? "bg-ok-soft text-ok" : "bg-primary-soft text-primary"}`}>
          {soltar.aviso.tipo === "subiendo" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {soltar.aviso.texto}
        </p>
      )}
      {movimientos.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="font-medium">{vacio.titulo}</p>
          {vacio.texto && <p className="mt-1 text-sm text-muted">{vacio.texto}</p>}
        </div>
      ) : (
        <>
          {/* Escritorio: columnas elegidas */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {visibles.map((c) => (
                    <th key={c.clave} scope="col" className={`whitespace-nowrap px-3 py-3 font-medium ${c.numero ? "text-right" : ""}`}>{c.etiqueta}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movimientos.map((m) => (
                  <tr
                    key={m.id}
                    {...soltar.props(m)}
                    className={`cursor-pointer align-top hover:bg-surface-2 ${soltar.clase(m)}`}
                    onClick={() => onAbrir(m)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") onAbrir(m); }}
                    aria-label={`Folio ${m.folio}, ${fmtFecha(m.fecha)}, ${m.proveedor || m.descripcion || m.concepto || "movimiento"}`}
                  >
                    {visibles.map((c) => (
                      <td key={c.clave} className={`px-3 py-2.5 ${c.numero ? "num whitespace-nowrap text-right" : c.clave === "fecha" || c.clave === "cuenta" || c.clave === "documentos" ? "" : "min-w-[9rem] max-w-[22rem] [overflow-wrap:break-word]"} ${["leyenda1", "leyenda2", "leyenda3", "observaciones", "referencia"].includes(c.clave) ? "text-muted" : ""}`}>
                        {celda(m, c.clave)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {movimientos.map((m) => (
              <li key={m.id} {...soltar.props(m)}>
                <button className={`card w-full p-4 text-left ${soltar.clase(m)}`} onClick={() => onAbrir(m)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="num text-xs text-muted">
                        <span className="font-semibold text-text">#{m.folio}</span> · {fmtFecha(m.fecha)}
                        {columnas.includes("cuenta") && <> · {m.cuenta}</>}
                      </p>
                      <p className="font-medium [overflow-wrap:anywhere]">{m.proveedor || m.descripcion || m.concepto || "Movimiento"}</p>
                      <p className="text-xs text-muted [overflow-wrap:anywhere]">
                        {[m.concepto, m.descripcion !== m.proveedor ? m.descripcion : null, m.leyenda1, m.leyenda2].filter(Boolean).join(" · ")}
                      </p>
                      <Insignias m={m} />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`num font-semibold ${Number(m.cargo) > 0 ? "text-danger" : "text-ok"}`}>
                        {Number(m.cargo) > 0 ? `−${dinero(m.cargo, m.moneda)}` : `+${dinero(m.abono, m.moneda)}`}
                      </p>
                      <p className="num mt-1 text-xs text-muted">Saldo {dinero(m.saldo, m.moneda)}</p>
                      {m.documentos > 0 && <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary"><Paperclip className="h-3 w-3" aria-hidden />{m.documentos}</p>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {paginas > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Páginas">
              {pagina > 1
                ? <Link className="btn-secondary" href={enlacePagina(pagina - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /> Más recientes</Link>
                : <span />}
              <p className="text-sm text-muted">Página {pagina} de {paginas.toLocaleString("es-MX")}</p>
              {pagina < paginas
                ? <Link className="btn-secondary" href={enlacePagina(pagina + 1)}>Anteriores <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                : <span />}
            </nav>
          )}
        </>
      )}
    </>
  );
}

function Insignias({ m }: { m: Movimiento }) {
  if (!m.transferencia_id && !m.es_ajuste && !m.aviso_whatsapp && !m.aviso_correo) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
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
    </span>
  );
}

function SelectorColumnas({ columnas, onCambio }: { columnas: ClaveColumna[]; onCambio: (c: ClaveColumna[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  function alternar(clave: ClaveColumna) {
    const nuevas = columnas.includes(clave) ? columnas.filter((c) => c !== clave) : [...columnas, clave];
    if (nuevas.length) onCambio(COLUMNAS.map((c) => c.clave).filter((c) => nuevas.includes(c)));
  }

  return (
    <div className="relative" ref={caja}>
      <button type="button" className="btn-secondary" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <Columns3 className="h-4 w-4" aria-hidden /> Columnas
      </button>
      {abierto && (
        <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-border bg-surface p-2 shadow-lg" role="group" aria-label="Columnas a mostrar">
          <p className="px-2 pb-1 text-xs text-muted">Elige qué columnas ver (se recuerda en este equipo)</p>
          {COLUMNAS.map((c) => (
            <label key={c.clave} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={columnas.includes(c.clave)} onChange={() => alternar(c.clave)} />
              {c.etiqueta}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Arrastrar y soltar archivos sobre un movimiento para adjuntarlos sin abrirlo.
function useSoltarArchivos(puedeAdjuntar?: (m: Movimiento) => boolean) {
  const router = useRouter();
  const [sobre, setSobre] = useState<number | null>(null);
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "subiendo" | "ok" | "error"; texto: string } | null>(null);
  const activo = !!puedeAdjuntar;

  // Si se suelta fuera de un movimiento, el navegador no debe abrir el archivo.
  useEffect(() => {
    if (!activo) return;
    const evitar = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => { window.removeEventListener("dragover", evitar); window.removeEventListener("drop", evitar); };
  }, [activo]);

  useEffect(() => {
    if (aviso?.tipo !== "ok") return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const conArchivos = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  function props(m: Movimiento) {
    if (!puedeAdjuntar || !puedeAdjuntar(m)) return {};
    return {
      onDragEnter: (e: React.DragEvent) => { if (conArchivos(e)) { e.preventDefault(); setSobre(m.id); } },
      onDragOver: (e: React.DragEvent) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (sobre !== m.id) setSobre(m.id);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setSobre((s) => (s === m.id ? null : s));
      },
      onDrop: async (e: React.DragEvent) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        setSobre(null);
        const archivos = [...e.dataTransfer.files];
        if (!archivos.length || subiendo) return;
        setSubiendo(m.id);
        setAviso({ tipo: "subiendo", texto: `Adjuntando ${archivos.length} archivo(s) al folio ${m.folio}…` });
        const errores = await subirArchivos(m.cuenta_id, m.id, archivos);
        setSubiendo(null);
        setAviso(errores.length
          ? { tipo: "error", texto: errores.join(" ") }
          : { tipo: "ok", texto: `Listo: ${archivos.length === 1 ? `"${archivos[0].name}" quedó adjunto` : `${archivos.length} archivos quedaron adjuntos`} al folio ${m.folio}.` });
        router.refresh();
      },
    };
  }

  function clase(m: Movimiento) {
    if (subiendo === m.id) return "opacity-60";
    if (sobre === m.id) return "bg-primary-soft outline-2 -outline-offset-2 outline-dashed outline-primary";
    return "";
  }

  return { props, clase, aviso };
}
