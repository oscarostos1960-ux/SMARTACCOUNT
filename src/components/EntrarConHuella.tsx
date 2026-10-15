"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { entrarConLlave, opcionesEntrada } from "@/app/llaves/actions";
import { biometriaDisponible, hayLlaveLocal, llaveLocal, mensajeError, usarLlave } from "@/lib/webauthn-cliente";

// Botón de la pantalla de entrada: solo aparece si este dispositivo ya tiene Face ID / huella activado
export default function EntrarConHuella() {
  const [listo, setListo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => setListo(hayLlaveLocal() && await biometriaDisponible()))();
  }, []);

  async function entrar() {
    setTrabajando(true);
    setError(undefined);
    try {
      const o = await opcionesEntrada();
      const datos = await usarLlave(o, llaveLocal()?.id);
      const r = await entrarConLlave(datos);   // si todo sale bien, redirige a Inicio
      if (r?.error) setError(r.error);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  }

  if (!listo) return null;
  return (
    <div className="mb-5 space-y-3" data-entrar-huella>
      <button type="button" onClick={entrar} disabled={trabajando} className="btn-primary w-full py-3 text-base">
        <Fingerprint className="h-6 w-6" aria-hidden /> {trabajando ? "Verificando…" : "Entrar con Face ID / huella"}
      </button>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="text-center text-xs text-muted">o entra con tu contraseña</p>
    </div>
  );
}
