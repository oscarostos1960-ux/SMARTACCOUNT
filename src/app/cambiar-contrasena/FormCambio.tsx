"use client";

import { useActionState } from "react";
import { cambiarContrasena, type EstadoCambio } from "./actions";

export default function FormCambio() {
  const [estado, accion, enviando] = useActionState<EstadoCambio, FormData>(cambiarContrasena, {});
  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="nueva" className="label">Nueva contraseña</label>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={8} className="input" />
        <p className="mt-1 text-xs text-muted">Mínimo 8 caracteres, con letras y números.</p>
      </div>
      <div>
        <label htmlFor="repetida" className="label">Repítela</label>
        <input id="repetida" name="repetida" type="password" autoComplete="new-password" required minLength={8} className="input" />
      </div>
      {estado.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{estado.error}</p>}
      <button type="submit" disabled={enviando} className="btn-primary w-full py-2.5">{enviando ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
