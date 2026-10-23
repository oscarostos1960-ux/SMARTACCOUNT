"use client";

import { useActionState } from "react";
import { pedirLiga, type EstadoRecuperar } from "./actions";

export default function FormRecuperar({ vencida }: { vencida: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoRecuperar, FormData>(pedirLiga, {});
  if (estado.ok) {
    return (
      <div className="space-y-3 text-sm" data-recuperar-enviado>
        <p className="font-semibold">Revisa tu correo</p>
        <p>Si <b>{estado.correo}</b> tiene cuenta en Smart Account, te llegará en un momento un correo con la liga para crear tu nueva contraseña.</p>
        <p className="text-muted">Si no lo ves, busca en la carpeta de spam o promociones. La liga vence en 1 hora.</p>
      </div>
    );
  }
  return (
    <form action={accion} className="space-y-4">
      {vencida && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">La liga ya se usó o venció. Pide una nueva.</p>}
      <p className="text-sm text-muted">Escribe tu correo y te enviaremos una liga para crear una nueva contraseña.</p>
      <div>
        <label htmlFor="correo" className="label">Correo electrónico</label>
        <input id="correo" name="correo" type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required defaultValue={estado.correo} className="input" />
      </div>
      {estado.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{estado.error}</p>}
      <button type="submit" disabled={enviando} className="btn-primary w-full py-2.5">{enviando ? "Enviando…" : "Enviarme la liga"}</button>
    </form>
  );
}
