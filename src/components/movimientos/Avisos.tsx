"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Clock, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { avisosEnEspera, enviarAviso, enviarAvisosEnEspera, listarAvisos, type Aviso } from "@/app/(app)/transacciones/actions";
import type { Canal, ResultadoAviso } from "@/lib/avisos";

const NOMBRE: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "Correo" };

export function ListaResultados({ resultados }: { resultados: ResultadoAviso[] }) {
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {resultados.map((r) => (
        <li key={r.canal} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-ok-soft text-ok" : r.espera ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}
          data-aviso={r.canal} data-ok={r.ok} data-espera={r.espera ? "1" : undefined}>
          {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : r.espera ? <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
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
// `revision` cambia cada vez que se adjuntan documentos: si había avisos en espera, salen en ese momento.
export default function AvisosMovimiento({ movimientoId, puedeEditar, revision = 0, hayDocumentos = false }: {
  movimientoId: number; puedeEditar: boolean; revision?: number;
  /** El movimiento ya tiene comprobante: si un aviso quedó en espera, se ofrece enviarlo */
  hayDocumentos?: boolean;
}) {
  const [historial, setHistorial] = useState<Aviso[] | null>(null);
  const [espera, setEspera] = useState<Canal[]>([]);
  const [resultados, setResultados] = useState<ResultadoAviso[]>();
  const [error, setError] = useState<string>();
  const [enviando, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarAvisos(movimientoId).then((a) => { if (vivo) setHistorial(a); });
    avisosEnEspera(movimientoId).then((c) => { if (vivo) setEspera(c); });
    return () => { vivo = false; };
  }, [movimientoId]);

  // Al adjuntar el comprobante salen solos los avisos que estaban en espera
  useEffect(() => {
    if (!revision) return;
    let vivo = true;
    enviarAvisosEnEspera(movimientoId).then(async (r) => {
      if (!vivo) return;
      if (r.error) setError(r.error);
      if (r.resultados) setResultados(r.resultados);
      const [h, c] = await Promise.all([listarAvisos(movimientoId), avisosEnEspera(movimientoId)]);
      if (vivo) { setHistorial(h); setEspera(c); }
    });
    return () => { vivo = false; };
  }, [movimientoId, revision]);

  function enviar(canales: Canal[]) {
    setError(undefined);
    setResultados(undefined);
    start(async () => {
      const r = await enviarAviso(movimientoId, canales);
      if (r.error) setError(r.error);
      if (r.resultados) setResultados(r.resultados);
      setHistorial(await listarAvisos(movimientoId));
      setEspera(await avisosEnEspera(movimientoId));
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
      {espera.length > 0 && !resultados && (
        <p className="mb-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn" data-en-espera>
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>{espera.map((c) => NOMBRE[c]).join(" y ")} en espera:</strong>{" "}
            {hayDocumentos ? "el comprobante ya está adjunto; envíalo ahora." : "se enviará solo en cuanto adjuntes el comprobante de pago."}
          </span>
          {hayDocumentos && puedeEditar && (
            <button type="button" className="btn-primary shrink-0 px-3 py-1" disabled={enviando} onClick={() => enviar(espera)} data-enviar-espera>
              <Send className="h-4 w-4" aria-hidden /> Enviar ahora
            </button>
          )}
        </p>
      )}
      {resultados && <div className="mb-2"><ListaResultados resultados={resultados} /></div>}
      {error && <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {historial === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted">
          No se ha enviado aviso.{puedeEditar && " Se manda la imagen del pago y los documentos adjuntos; sin comprobante adjunto queda en espera."}
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
