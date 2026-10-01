"use client";

import { useActionState } from "react";
import { enviarPrueba } from "./actions";

const IMAGEN_PRUEBA = "https://raw.githubusercontent.com/oscarostos1960-ux/SMARTACCOUNT/main/src/assets/aviso-fondo.jpg";

export default function FormPrueba() {
  const [estado, accion, enviando] = useActionState(enviarPrueba, {});
  return (
    <form action={accion} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4 sm:items-end">
      <h2 className="font-semibold sm:col-span-4">Enviar prueba a un celular</h2>
      <div className="sm:col-span-2">
        <label htmlFor="d-cel" className="label">Celular (10 dígitos)</label>
        <input id="d-cel" name="celular" inputMode="numeric" className="input" required />
      </div>
      <div>
        <label htmlFor="d-formato" className="label">Formato</label>
        <select id="d-formato" name="formato" className="input" defaultValue="52">
          <option value="52">52 + 10 dígitos</option>
          <option value="521">521 + 10 dígitos</option>
        </select>
      </div>
      <input type="hidden" name="imagen" value={IMAGEN_PRUEBA} />
      <button className="btn-primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar prueba"}</button>
      {estado.texto && <pre className="whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs sm:col-span-4">{estado.texto}</pre>}
    </form>
  );
}
