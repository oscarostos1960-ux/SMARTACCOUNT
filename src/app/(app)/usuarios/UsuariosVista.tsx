"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, KeyRound, Trash2 } from "lucide-react";
import type { Perfil } from "@/lib/auth";
import type { CuentaCorta } from "@/lib/transacciones";
import { cambiarPermiso, cambiarRol, crearUsuario, eliminarUsuario, restablecerContrasena, type Resultado } from "./actions";

export type Permiso = { usuario_id: string; cuenta_id: number; nivel: "ver" | "editar" };

const ROLES = [
  { valor: "titular", etiqueta: "Titular (control total)" },
  { valor: "usuario", etiqueta: "Acceso por cuenta" },
  { valor: "pendiente", etiqueta: "Sin acceso" },
];

export default function UsuariosVista({ usuarios, cuentas, permisos, yo }: {
  usuarios: Perfil[]; cuentas: CuentaCorta[]; permisos: Permiso[]; yo: string;
}) {
  const [mensaje, setMensaje] = useState<Resultado>({});
  const [pendiente, startTransition] = useTransition();
  const [estado, invitar, invitando] = useActionState<Resultado, FormData>(crearUsuario, {});
  const [abierto, setAbierto] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div className="card divide-y divide-border">
        {usuarios.map((u) => {
          const suyos = permisos.filter((p) => p.usuario_id === u.id);
          return (
            <div key={u.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{u.nombre} {u.id === yo && <span className="badge ml-1 bg-primary-soft text-primary">Tú</span>}</p>
                  <p className="truncate text-sm text-muted">{u.correo}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`rol-${u.id}`}>Rol de {u.nombre}</label>
                  <select
                    id={`rol-${u.id}`}
                    className="input sm:w-56"
                    defaultValue={u.rol}
                    disabled={pendiente || u.id === yo}
                    onChange={(e) => startTransition(async () => setMensaje(await cambiarRol(u.id, e.target.value)))}
                  >
                    {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                  </select>
                  {u.id !== yo && (
                    <button type="button" className="btn-ghost px-2" title="Darle una nueva contraseña temporal" disabled={pendiente} data-restablecer={u.correo ?? u.id}
                      onClick={() => { if (confirm(`¿Dar una nueva contraseña temporal a ${u.nombre}? La actual dejará de funcionar.`)) startTransition(async () => setMensaje(await restablecerContrasena(u.id))); }}>
                      <KeyRound className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Contraseña</span>
                    </button>
                  )}
                  {u.id !== yo && (
                    <button type="button" className="btn-ghost px-2 text-danger" title="Eliminar usuario" aria-label={`Eliminar a ${u.nombre}`} disabled={pendiente} data-eliminar={u.correo ?? u.id}
                      onClick={() => { if (confirm(`¿Eliminar a ${u.nombre} (${u.correo})? Ya no podrá entrar. Los movimientos que capturó se conservan.`)) startTransition(async () => setMensaje(await eliminarUsuario(u.id))); }}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  {u.rol === "usuario" && (
                    <button type="button" className="btn-secondary" aria-expanded={abierto === u.id} onClick={() => setAbierto(abierto === u.id ? null : u.id)}>
                      Cuentas ({suyos.length}) <ChevronDown className={`h-4 w-4 transition-transform ${abierto === u.id ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              {u.rol === "usuario" && abierto === u.id && (
                <PermisosCuentas usuario={u} cuentas={cuentas} permisos={suyos} onMensaje={setMensaje} />
              )}
            </div>
          );
        })}
      </div>
      {(mensaje.ok || mensaje.error) && (
        <p role="status" data-mensaje className={`select-text rounded-lg px-3 py-2 text-sm ${mensaje.error ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
          {mensaje.error ?? mensaje.ok}
        </p>
      )}

      <section className="card p-6" aria-labelledby="invitar">
        <h2 id="invitar" className="font-semibold">Agregar usuario</h2>
        <p className="mt-1 text-sm text-muted">Se crea con una contraseña temporal que le mandas tú (por WhatsApp, por ejemplo). La primera vez que entre, la app le pedirá cambiarla. Después eliges a qué cuentas tiene acceso.</p>
        <form action={invitar} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="inv-nombre" className="label">Nombre</label>
            <input id="inv-nombre" name="nombre" className="input" />
          </div>
          <div>
            <label htmlFor="inv-correo" className="label">Correo *</label>
            <input id="inv-correo" name="correo" type="email" required className="input" />
          </div>
          <div>
            <label htmlFor="inv-pass" className="label">Contraseña temporal</label>
            <input id="inv-pass" name="contrasena" className="input" autoComplete="off" placeholder="Déjala vacía y se genera una" />
          </div>
          <div>
            <label htmlFor="inv-rol" className="label">Permiso</label>
            <select id="inv-rol" name="rol" defaultValue="usuario" className="input">
              <option value="usuario">Acceso por cuenta</option>
              <option value="titular">Titular (control total)</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn-primary" disabled={invitando}>{invitando ? "Creando…" : "Crear usuario"}</button>
            {(estado.ok || estado.error) && (
              <span role="status" data-alta className={`select-text text-sm ${estado.error ? "text-danger" : "text-ok"}`}>{estado.error ?? estado.ok}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function PermisosCuentas({ usuario, cuentas, permisos, onMensaje }: {
  usuario: Perfil; cuentas: CuentaCorta[]; permisos: Permiso[]; onMensaje: (r: Resultado) => void;
}) {
  const [guardando, startTransition] = useTransition();
  const [verInactivas, setVerInactivas] = useState(false);
  const nivel = new Map(permisos.map((p) => [Number(p.cuenta_id), p.nivel]));
  const lista = cuentas.filter((c) => c.activa || verInactivas || nivel.has(c.cuenta_id));

  const cambiar = (ids: number[], n: string) =>
    startTransition(async () => onMensaje(await cambiarPermiso(usuario.id, ids, n)));

  return (
    <div className="mt-4 rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2 text-sm">
        <span className="text-muted">Permisos de {usuario.nombre} en cada cuenta</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
            Inactivas
          </label>
          <button type="button" className="font-medium text-primary hover:underline" disabled={guardando} onClick={() => cambiar(lista.map((c) => c.cuenta_id), "ver")}>Todas: consultar</button>
          <button type="button" className="font-medium text-primary hover:underline" disabled={guardando} onClick={() => cambiar(lista.map((c) => c.cuenta_id), "")}>Quitar todas</button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {lista.map((c) => (
          <li key={c.cuenta_id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span className={`text-sm ${c.activa ? "" : "text-muted"}`}>{c.nombre} <span className="text-xs text-muted">{c.moneda}</span></span>
            <label className="sr-only" htmlFor={`p-${usuario.id}-${c.cuenta_id}`}>Permiso en {c.nombre}</label>
            <select
              id={`p-${usuario.id}-${c.cuenta_id}`}
              className="input sm:w-52"
              value={nivel.get(c.cuenta_id) ?? ""}
              disabled={guardando}
              onChange={(e) => cambiar([c.cuenta_id], e.target.value)}
            >
              <option value="">Sin acceso</option>
              <option value="ver">Solo consultar</option>
              <option value="editar">Consultar y capturar</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
