"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { guardarLlave, misLlaves, opcionesRegistro, quitarLlave, type Llave } from "@/app/llaves/actions";
import { biometriaDisponible, crearLlave, llaveLocal, mensajeError, nombreDispositivo, olvidarLlave, recordarLlave } from "@/lib/webauthn-cliente";

// Dispositivos donde se puede entrar con Face ID / huella; activar este o quitar alguno
export default function SeccionHuella() {
  const [llaves, setLlaves] = useState<Llave[] | null>(null);
  const [disponible, setDisponible] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok?: string; error?: string }>({});
  const cargar = async () => setLlaves(await misLlaves());

  useEffect(() => { void cargar(); void biometriaDisponible().then(setDisponible); }, []);

  async function activar() {
    setTrabajando(true);
    setMensaje({});
    try {
      const o = await opcionesRegistro();
      if ("error" in o && o.error) throw new Error(o.error);
      const datos = await crearLlave(o as Exclude<typeof o, { error: string }>);
      const r = await guardarLlave(datos, nombreDispositivo());
      if (r.error) throw new Error(r.error);
      recordarLlave(datos.id, (o as { correo: string }).correo);
      setMensaje({ ok: "Activado en este dispositivo." });
      await cargar();
    } catch (e) {
      setMensaje({ error: mensajeError(e) });
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar(l: Llave) {
    if (!confirm(`¿Quitar Face ID / huella de "${l.nombre ?? "dispositivo"}"? Ahí tendrás que entrar con tu contraseña.`)) return;
    const r = await quitarLlave(l.id);
    if (r.error) return setMensaje({ error: r.error });
    if (llaves && llaves.length === 1) olvidarLlave();
    await cargar();
  }

  const local = typeof window !== "undefined" ? llaveLocal() : null;
  return (
    <div className="card mt-6 border-0 p-6 shadow-xl" data-seccion-huella>
      <h2 className="flex items-center gap-2 font-semibold"><Fingerprint className="h-5 w-5 text-accent-strong" aria-hidden /> Entrar con Face ID / huella</h2>
      {llaves && llaves.length > 0 ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {llaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2" data-llave={l.id}>
              <span>{l.nombre ?? "Dispositivo"} <span className="text-xs text-muted">· {l.dominio}</span></span>
              <button type="button" className="btn-ghost px-2 text-danger" onClick={() => quitar(l)} aria-label={`Quitar ${l.nombre ?? "dispositivo"}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Todavía no lo activas en ningún dispositivo.</p>
      )}
      {disponible && !local && (
        <button type="button" className="btn-primary mt-3 w-full" onClick={activar} disabled={trabajando} data-activar-huella>
          {trabajando ? "Activando…" : "Activar en este dispositivo"}
        </button>
      )}
      {!disponible && <p className="mt-2 text-xs text-muted">Este dispositivo o navegador no tiene Face ID / huella disponible.</p>}
      {mensaje.ok && <p className="mt-2 text-sm text-ok">{mensaje.ok}</p>}
      {mensaje.error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{mensaje.error}</p>}
    </div>
  );
}
