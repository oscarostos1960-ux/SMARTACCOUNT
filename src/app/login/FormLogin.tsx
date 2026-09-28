"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";

export default function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="correo" className="label">Correo electrónico</label>
        <input id="correo" name="correo" type="email" autoComplete="email" required defaultValue={estado.correo} className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{estado.error}</p>
      )}
      <button type="submit" disabled={enviando} className="btn-primary w-full py-2.5">
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
