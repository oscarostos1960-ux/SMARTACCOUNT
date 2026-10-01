"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { enviarAviso, listarAvisos, type Aviso } from "@/app/(app)/transacciones/actions";
import type { Canal, ResultadoAviso } from "@/lib/avisos";

const NOMBRE: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "Correo" };

export function ListaResultados({ resultados }: { resultados: ResultadoAviso[] }) {
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {resultados.map((r) => (
        <li key={r.canal} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}
          data-aviso={r.canal} data-ok={r.ok}>
          {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span><strong>{NOMBRE[r.canal]}{r.destino ? ` (${r.destino})` : ""}:</strong> {r.mensaje}</span>
        </li>
      ))}
    </ul>
  );
}

const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(iso));

// Sección "Avisos al proveedor" dentro de un movimiento ya guardado: reenviar y ver historial.
export default function AvisosMovimiento({ movimientoId, puedeEditar }: { movimientoId: number; puedeEditar: boolean }) {
  const [historial, setHistorial] = useState<Aviso[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoAviso[]>();
  const [error, setError] = useState<string>();
  const [enviando, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarAvisos(movimientoId).then((a) => { if (vivo) setHistorial(a); });
    return () => { vivo = false; };
  }, [movimientoId]);

  function enviar(canales: Canal[]) {
    setError(undefined);
    setResultados(undefined);
    start(async () => {
      const r = await enviarAviso(movimientoId, canales);
      if (r.error) setError(r.error);
      if (r.resultados) setResultados(r.resultados);
      setHistorial(await listarAvisos(movimientoId));
    });
  }

  return (
    <section className="sm:col-span-6" aria-labelledby={`avisos-${movimientoId}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`avisos-${movimientoId}`} className="label mb-0 flex items-center gap-1.5">
          <Send className="h-4 w-4" aria-hidden /> Aviso al proveedor
        </h3>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5" disabled={enviando} onClick={() => enviar(["whatsapp"])}>
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </button>
            <button type="button" className="btn-secondary px-3 py-1.5" disabled={enviando} onClick={() => enviar(["correo"])}>
              <Mail className="h-4 w-4" aria-hidden /> Correo
            </button>
          </div>
        )}
      </div>
      {enviando && <p className="mb-2 text-sm text-muted">Enviando…</p>}
      {resultados && <div className="mb-2"><ListaResultados resultados={resultados} /></div>}
      {error && <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {historial === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted">
          No se ha enviado aviso.{puedeEditar && " Se manda la imagen del pago y los documentos adjuntos."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {historial.map((a) => (
            <li key={a.id} className="flex items-start gap-2 px-3 py-2">
              {a.estado === "enviado" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Enviado" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Error" />}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{NOMBRE[a.canal]}</span>{a.destino ? ` · ${a.destino}` : ""}
                <span className="block text-xs text-muted">{fechaHora(a.created_at)} · {a.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
