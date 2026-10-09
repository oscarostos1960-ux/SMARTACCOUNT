"use client";

import { useActionState, useState, useTransition } from "react";
import { Building, KeyRound, Mail, Sparkles } from "lucide-react";
import { crearCliente, restablecerCliente, type Resultado } from "./actions";

export type Cliente = {
  id: number; nombre: string; titular: string | null; correo: string | null; creado: string;
  usuarios: number; cuentas: number; ia: boolean; correoPropio: boolean;
};

export default function ClientesVista({ clientes }: { clientes: Cliente[] }) {
  const [estado, crear, creando] = useActionState<Resultado, FormData>(crearCliente, {});
  const [mensaje, setMensaje] = useState<Resultado>({});
  const [pendiente, startTransition] = useTransition();

  return (
    <section className="space-y-4" aria-labelledby="clientes" data-clientes>
      <div>
        <h2 id="clientes" className="text-xl font-extrabold text-primary">Clientes con espacio propio</h2>
        <p className="mt-1 text-sm text-muted">
          Cada cliente empieza con su Smart Account en blanco: da de alta sus propios bancos, cuentas, proveedores y clasificaciones.
          No ve nada tuyo y tú no ves sus datos. Lee sus estados de cuenta con su propia clave de IA (paga lo que consume)
          y puede invitar a sus propios usuarios.
        </p>
      </div>

      {clientes.length > 0 && (
        <div className="card divide-y divide-border">
          {clientes.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-cliente={c.correo ?? c.id}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><Building className="h-4 w-4 text-accent-strong" aria-hidden /> {c.nombre}</p>
                <p className="truncate text-sm text-muted">{c.titular} · {c.correo}</p>
                <p className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className="badge bg-surface-2 text-muted">{c.usuarios} usuario{c.usuarios === 1 ? "" : "s"} · {c.cuentas} cuenta{c.cuentas === 1 ? "" : "s"}</span>
                  <span className={`badge ${c.ia ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}><Sparkles className="h-3 w-3" aria-hidden /> {c.ia ? "IA propia lista" : "Sin clave de IA"}</span>
                  <span className={`badge ${c.correoPropio ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}><Mail className="h-3 w-3" aria-hidden /> {c.correoPropio ? "Correo propio" : "Correo general"}</span>
                  <span className="badge bg-surface-2 text-muted">desde {c.creado}</span>
                </p>
              </div>
              <button type="button" className="btn-ghost shrink-0 px-2" disabled={pendiente} data-restablecer-cliente={c.correo ?? c.id}
                onClick={() => { if (confirm(`¿Dar una nueva contraseña temporal a ${c.titular ?? c.nombre}? La actual dejará de funcionar.`)) startTransition(async () => setMensaje(await restablecerCliente(c.id))); }}>
                <KeyRound className="h-4 w-4" aria-hidden /> Contraseña
              </button>
            </div>
          ))}
        </div>
      )}
      {(mensaje.ok || mensaje.error) && (
        <p role="status" className={`select-text rounded-lg px-3 py-2 text-sm ${mensaje.error ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>{mensaje.error ?? mensaje.ok}</p>
      )}

      <div className="card p-6">
        <h3 className="font-semibold">Crear cliente con su propio espacio</h3>
        <p className="mt-1 text-sm text-muted">Se crea su espacio vacío y su usuario titular con una contraseña temporal que le mandas tú.</p>
        <form action={crear} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cli-espacio" className="label">Nombre del espacio</label>
            <input id="cli-espacio" name="espacio" className="input" placeholder="Ej. Despacho Pérez" />
          </div>
          <div>
            <label htmlFor="cli-nombre" className="label">Nombre del cliente</label>
            <input id="cli-nombre" name="nombre" className="input" placeholder="Así firma sus avisos de pago" />
          </div>
          <div>
            <label htmlFor="cli-correo" className="label">Correo *</label>
            <input id="cli-correo" name="correo" type="email" required className="input" />
          </div>
          <div>
            <label htmlFor="cli-pass" className="label">Contraseña temporal</label>
            <input id="cli-pass" name="contrasena" className="input" autoComplete="off" placeholder="Déjala vacía y se genera una" />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn-primary" disabled={creando} data-crear-cliente>{creando ? "Creando…" : "Crear cliente"}</button>
            {(estado.ok || estado.error) && (
              <span role="status" data-alta-cliente className={`select-text text-sm ${estado.error ? "text-danger" : "text-ok"}`}>{estado.error ?? estado.ok}</span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
