"use client";

import { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import { guardarLlave, opcionesRegistro } from "@/app/llaves/actions";
import { biometriaDisponible, crearLlave, hayLlaveLocal, mensajeError, nombreDispositivo, recordarLlave } from "@/lib/webauthn-cliente";

// 1) App instalada en el celular: si sales de ella (la cierras o te vas a otra app) por más de
//    MINUTOS_FUERA, la sesión se cierra y al volver pide Face ID / huella o contraseña.
// 2) Ofrece activar Face ID / huella en este dispositivo (una sola vez, se puede descartar).
const MINUTOS_FUERA = 1;
const CLAVE_FUERA = "sa-fuera-desde";
const CLAVE_NO_OFRECER = "sa-huella-no";

const esAppInstalada = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const poner = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

async function cerrarSesion() {
  poner(CLAVE_FUERA, null);
  try { await fetch("/auth/salir", { method: "POST", redirect: "manual" }); } catch { /* sin conexión */ }
  window.location.replace("/login");
}

export default function GuardiaApp() {
  const [ofrecer, setOfrecer] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    if (!esAppInstalada()) return;
    const vencida = () => {
      const desde = Number(leer(CLAVE_FUERA));
      return desde > 0 && Date.now() - desde >= MINUTOS_FUERA * 60_000;
    };
    // Al abrir la app: si se quedó cerrada más del tiempo, se cierra la sesión
    if (vencida()) { void cerrarSesion(); return; }
    poner(CLAVE_FUERA, null);
    const alCambiar = () => {
      if (document.visibilityState === "hidden") poner(CLAVE_FUERA, String(Date.now()));
      else if (vencida()) void cerrarSesion();
      else poner(CLAVE_FUERA, null);
    };
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", alCambiar);
    return () => { document.removeEventListener("visibilitychange", alCambiar); window.removeEventListener("pagehide", alCambiar); };
  }, []);

  useEffect(() => {
    (async () => {
      const tactil = window.matchMedia("(pointer: coarse)").matches;
      if ((esAppInstalada() || tactil) && !hayLlaveLocal() && !leer(CLAVE_NO_OFRECER) && await biometriaDisponible()) setOfrecer(true);
    })();
  }, []);

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
      setMensaje({ ok: "Listo. La próxima vez entra con Face ID / huella." });
      setTimeout(() => setOfrecer(false), 2500);
    } catch (e) {
      setMensaje({ error: mensajeError(e) });
    } finally {
      setTrabajando(false);
    }
  }

  if (!ofrecer) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 rounded-2xl bg-primary p-4 text-white shadow-xl lg:left-auto lg:right-6 lg:w-96" role="dialog" aria-label="Entrar con Face ID / huella" data-ofrecer-huella>
      <div className="flex items-start gap-3">
        <Fingerprint className="mt-0.5 h-7 w-7 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-bold">¿Entrar con Face ID / huella?</p>
          <p className="mt-0.5 text-sm text-white/80">La próxima vez entras sin escribir tu contraseña.</p>
          {mensaje.ok && <p className="mt-2 text-sm font-semibold">{mensaje.ok}</p>}
          {mensaje.error && <p role="alert" className="mt-2 rounded-lg bg-white/15 px-2 py-1 text-sm">{mensaje.error}</p>}
          {!mensaje.ok && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={activar} disabled={trabajando} className="btn bg-accent-strong text-white" data-activar-huella>
                {trabajando ? "Activando…" : "Activar"}
              </button>
              <button type="button" onClick={() => { poner(CLAVE_NO_OFRECER, "1"); setOfrecer(false); }} className="btn text-white/80 hover:bg-white/10">Ahora no</button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setOfrecer(false)} className="p-1 text-white/70" aria-label="Cerrar"><X className="h-5 w-5" aria-hidden /></button>
      </div>
    </div>
  );
}
