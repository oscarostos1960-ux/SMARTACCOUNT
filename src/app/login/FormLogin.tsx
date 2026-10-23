"use client";

import { useActionState } from "react";
import Link from "next/link";
import { iniciarSesion, type EstadoLogin } from "./actions";
import InputContrasena from "@/components/InputContrasena";
import EntrarConHuella from "@/components/EntrarConHuella";

export default function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  return (
    <>
    <EntrarConHuella />
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="correo" className="label">Correo electrónico</label>
        <input id="correo" name="correo" type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required defaultValue={estado.correo} className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Contraseña</label>
        <InputContrasena id="password" name="password" autoComplete="current-password" required className="input" />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{estado.error}</p>
      )}
      <button type="submit" disabled={enviando} className="btn-primary w-full py-2.5">
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-sm"><Link href="/login/recuperar" className="font-medium text-primary hover:underline" data-olvide>¿Olvidaste tu contraseña?</Link></p>
    </form>
    </>
  );
}
