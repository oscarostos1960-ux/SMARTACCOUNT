"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, CircleSlash, ExternalLink, RotateCcw, Wallet } from "lucide-react";
import { Campo, Dialogo } from "@/components/movimientos/DialogoMovimiento";
import { dineroClave, fecha } from "@/lib/formato";
import { describirFrecuencia, type PagoProgramado, type Vencimiento } from "@/lib/pagos";
import { actualizarVencimiento } from "./actions";

export default function DialogoVencimiento({
  v, plan, puedeCambiar, onPagar, onVerPlan, onCerrar,
}: {
  v: Vencimiento;
  plan: PagoProgramado | undefined;
  puedeCambiar: boolean;
  onPagar: () => void;
  onVerPlan: () => void;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [trabajando, start] = useTransition();
  const [error, setError] = useState<string>();
  const cerrar = () => dialogo.current?.close();

  function hacer(cambios: Parameters<typeof actualizarVencimiento>[1]) {
    start(async () => {
      const r = await actualizarVencimiento(v.id, cambios);
      if (r.error) setError(r.error); else cerrar();
    });
  }

  function guardar(fd: FormData) {
    const importeTexto = String(fd.get("importe") ?? "").replace(/[$,\s]/g, "");
    const importe = importeTexto === "" ? null : Number(importeTexto);
    const planImporte = plan ? Math.max(plan.cargo, plan.abono) : 0;
    hacer({
      fecha: String(fd.get("fecha")),
      importe: importe === null || importe === planImporte ? null : importe,
      notas: String(fd.get("notas") ?? ""),
    });
  }

  const quien = v.proveedor ?? v.concepto ?? v.descripcion ?? "Pago";
  const estadoTexto = { pendiente: "Pendiente", pagado: "Pagado", omitido: "Omitido" }[v.estado];

  return (
    <Dialogo titulo={quien} refDialogo={dialogo} onCerrar={onCerrar}>
      <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Fecha</dt><dd className="font-medium">{fecha(v.fecha)}</dd></div>
          <div><dt className="text-muted">Importe</dt><dd className="num font-medium">{Number(v.importe) > 0 ? dineroClave(v.importe, v.moneda) : "Variable"}</dd></div>
          <div><dt className="text-muted">Estado</dt><dd className="font-medium">{estadoTexto}</dd></div>
          {v.concepto && <div><dt className="text-muted">Concepto</dt><dd>{v.concepto}</dd></div>}
          <div><dt className="text-muted">Cuenta</dt><dd>{v.cuenta ?? "Sin cuenta fija"}</dd></div>
          {plan && <div><dt className="text-muted">Frecuencia</dt><dd>{describirFrecuencia(plan)}</dd></div>}
          {v.descripcion && <div className="col-span-2 sm:col-span-3"><dt className="text-muted">Transacción</dt><dd>{v.descripcion}</dd></div>}
        </dl>

        {v.estado === "pagado" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {v.folio != null && v.cuenta_pago_id ? (
              <span>Pagado con el folio {v.folio} de {v.cuenta_pago}.{" "}
                <Link className="inline-flex items-center gap-1 font-medium underline" href={`/transacciones/${v.cuenta_pago_id}`}>Ver cuenta <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>
              </span>
            ) : <span>Marcado como pagado.</span>}
          </div>
        )}
        {v.estado === "omitido" && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">Esta fecha se omitió: no cuenta como pendiente.</p>
        )}

        {puedeCambiar && v.estado === "pendiente" && (
          <form action={guardar} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Cambiar solo esta fecha</p>
            <Campo id="v-fecha" etiqueta="Fecha">
              <input id="v-fecha" name="fecha" type="date" required defaultValue={v.fecha} className="input" />
            </Campo>
            <Campo id="v-importe" etiqueta={`Importe (${v.moneda})`}>
              <input id="v-importe" name="importe" type="text" inputMode="decimal" defaultValue={Number(v.importe) > 0 ? String(v.importe) : ""} className="input num text-right" placeholder="Variable" />
            </Campo>
            <Campo id="v-notas" etiqueta="Notas" className="sm:col-span-2">
              <input id="v-notas" name="notas" type="text" defaultValue={v.notas ?? ""} className="input" maxLength={1000} />
            </Campo>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-secondary" disabled={trabajando}>Guardar cambios de esta fecha</button>
            </div>
          </form>
        )}
        {v.notas && !(puedeCambiar && v.estado === "pendiente") && <p className="text-sm"><span className="text-muted">Notas:</span> {v.notas}</p>}
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {plan && <button type="button" className="btn-ghost" onClick={onVerPlan}>Ver pago programado</button>}
          {puedeCambiar && v.estado === "pendiente" && (
            <button type="button" className="btn-ghost" onClick={() => hacer({ estado: "omitido" })} disabled={trabajando}>
              <CircleSlash className="h-4 w-4" aria-hidden /> Omitir esta fecha
            </button>
          )}
          {puedeCambiar && v.estado !== "pendiente" && (
            <button type="button" className="btn-ghost" onClick={() => hacer({ estado: "pendiente" })} disabled={trabajando}
              title={v.estado === "pagado" ? "El movimiento registrado no se borra" : undefined}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {v.estado === "pagado" ? "Desmarcar pagado" : "Volver a pendiente"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={cerrar}>Cerrar</button>
          {puedeCambiar && v.estado === "pendiente" && (
            <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={onPagar}><Wallet className="h-4 w-4" aria-hidden /> Registrar pago</button>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
