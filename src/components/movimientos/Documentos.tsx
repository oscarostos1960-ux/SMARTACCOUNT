"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  eliminarDocumento, listarDocumentos, registrarDocumento, type Documento,
} from "@/app/(app)/transacciones/actions";

const MAX_MB = 25;

function nombreSeguro(nombre: string) {
  const limpio = nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z0-9._-]+/g, "_");
  return limpio.slice(-80) || "archivo";
}

// Sube archivos a Storage (desde el navegador) y los registra en el movimiento.
export async function subirArchivos(cuentaId: number, movimientoId: number, archivos: File[]) {
  const supabase = createClient();
  const errores: string[] = [];
  for (const archivo of archivos) {
    if (archivo.size > MAX_MB * 1024 * 1024) {
      errores.push(`${archivo.name}: pesa más de ${MAX_MB} MB.`);
      continue;
    }
    const ruta = `${cuentaId}/${movimientoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nombreSeguro(archivo.name)}`;
    const { error } = await supabase.storage.from("documentos").upload(ruta, archivo, {
      contentType: archivo.type || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      errores.push(`${archivo.name}: no se pudo subir.`);
      continue;
    }
    const r = await registrarDocumento(movimientoId, archivo.name, ruta, archivo.type, archivo.size);
    if (r.error) errores.push(`${archivo.name}: ${r.error}`);
  }
  return errores;
}

function tamano(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function Documentos({ cuentaId, movimientoId, puedeEditar }: { cuentaId: number; movimientoId: number; puedeEditar: boolean }) {
  const [docs, setDocs] = useState<Documento[] | null>(null);
  const [error, setError] = useState<string>();
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    listarDocumentos(movimientoId).then((d) => { if (vivo) setDocs(d); });
    return () => { vivo = false; };
  }, [movimientoId]);

  async function recargar() {
    setDocs(await listarDocumentos(movimientoId));
  }

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    setError(undefined);
    const errores = await subirArchivos(cuentaId, movimientoId, [...archivos]);
    if (errores.length) setError(errores.join(" "));
    await recargar();
    setSubiendo(false);
    if (entrada.current) entrada.current.value = "";
  }

  function borrar(id: number) {
    startBorrar(async () => {
      const r = await eliminarDocumento(id);
      if (r.error) setError(r.error);
      await recargar();
    });
  }

  return (
    <section className="sm:col-span-6" aria-labelledby={`docs-${movimientoId}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={`docs-${movimientoId}`} className="label mb-0 flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" aria-hidden /> Documentos {docs ? `(${docs.length})` : ""}
        </h3>
        {puedeEditar && (
          <>
            <input ref={entrada} type="file" multiple className="sr-only" id={`subir-${movimientoId}`} onChange={(e) => subir(e.target.files)} disabled={subiendo} />
            <label htmlFor={`subir-${movimientoId}`} className={`btn-secondary cursor-pointer px-3 py-1.5 ${subiendo ? "pointer-events-none opacity-60" : ""}`}>
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {subiendo ? "Subiendo…" : "Adjuntar"}
            </label>
          </>
        )}
      </div>
      {docs === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted">Sin documentos.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-primary hover:underline">{d.nombre}</a>
              <span className="shrink-0 text-xs text-muted">{tamano(d.tamano)}</span>
              {puedeEditar && (
                <button type="button" className="btn-ghost p-1.5 text-danger" onClick={() => borrar(d.id)} disabled={borrando} aria-label={`Eliminar ${d.nombre}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
