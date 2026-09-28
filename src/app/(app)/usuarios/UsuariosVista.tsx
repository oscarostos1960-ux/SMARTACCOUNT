"use client";

import { useActionState, useState, useTransition } from "react";
import type { Perfil } from "@/lib/auth";
import { cambiarRol, invitarUsuario, type Resultado } from "./actions";

const ROLES = [
  { valor: "titular", etiqueta: "Titular" },
  { valor: "contador", etiqueta: "Contador (solo consulta)" },
  { valor: "pendiente", etiqueta: "Sin acceso" },
];

export default function UsuariosVista({ usuarios, yo }: { usuarios: Perfil[]; yo: string }) {
  const [mensaje, setMensaje] = useState<Resultado>({});
  const [pendiente, startTransition] = useTransition();
  const [estado, invitar, invitando] = useActionState<Resultado, FormData>(invitarUsuario, {});

  return (
    <div className="space-y-8">
      <div className="card divide-y divide-border">
        {usuarios.map((u) => (
          <div key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{u.nombre} {u.id === yo && <span className="badge ml-1 bg-primary-soft text-primary">Tú</span>}</p>
              <p className="truncate text-sm text-muted">{u.correo}</p>
            </div>
            <label className="sr-only" htmlFor={`rol-${u.id}`}>Rol de {u.nombre}</label>
            <select
              id={`rol-${u.id}`}
              className="input sm:w-56"
              defaultValue={u.rol}
              disabled={pendiente}
              onChange={(e) => startTransition(async () => setMensaje(await cambiarRol(u.id, e.target.value)))}
            >
              {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
            </select>
          </div>
        ))}
      </div>
      {(mensaje.ok || mensaje.error) && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${mensaje.error ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
          {mensaje.error ?? mensaje.ok}
        </p>
      )}

      <section className="card p-6" aria-labelledby="invitar">
        <h2 id="invitar" className="font-semibold">Invitar a alguien</h2>
        <p className="mt-1 text-sm text-muted">Le llegará un correo para crear su contraseña.</p>
        <form action={invitar} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="inv-nombre" className="label">Nombre</label>
            <input id="inv-nombre" name="nombre" className="input" />
          </div>
          <div>
            <label htmlFor="inv-correo" className="label">Correo *</label>
            <input id="inv-correo" name="correo" type="email" required className="input" />
          </div>
          <div>
            <label htmlFor="inv-rol" className="label">Permiso</label>
            <select id="inv-rol" name="rol" defaultValue="contador" className="input">
              <option value="contador">Contador (solo consulta)</option>
              <option value="titular">Titular</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button className="btn-primary" disabled={invitando}>{invitando ? "Enviando…" : "Enviar invitación"}</button>
            {(estado.ok || estado.error) && (
              <span role="status" className={`text-sm ${estado.error ? "text-danger" : "text-ok"}`}>{estado.error ?? estado.ok}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
