"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, CalendarPlus, Home, Landmark, Plus, X } from "lucide-react";
import { dinero } from "@/lib/formato";

// Barra inferior para el celular: lo más usado a un toque (saldos, registrar un pago, programar un pago).
export type CuentaRapida = { cuenta_id: number; nombre: string; moneda: string; saldo: number };

const CLAVE_ULTIMA = "sa-ultima-cuenta";
const leerUltima = () => { try { return Number(localStorage.getItem(CLAVE_ULTIMA)) || null; } catch { return null; } };
const guardarUltima = (id: number) => { try { localStorage.setItem(CLAVE_ULTIMA, String(id)); } catch { /* sin almacenamiento */ } };

export default function BarraMovil({ cuentas, esTitular }: { cuentas: CuentaRapida[]; esTitular: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);

  // La cuenta usada la última vez va primero
  const ordenadas = ultima ? [...cuentas].sort((a, b) => (a.cuenta_id === ultima ? -1 : b.cuenta_id === ultima ? 1 : 0)) : cuentas;

  function elegir(id: number) {
    guardarUltima(id);
    setEligiendo(false);
    router.push(`/transacciones/${id}?nuevo=1`);
  }

  const item = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium";
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href)) ? "text-primary" : "text-muted";

  return (
    <>
      <nav aria-label="Accesos rápidos" data-barra-movil
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <Link href="/" className={`${item} ${activo("/")}`}><Home className="h-5 w-5" aria-hidden /> Inicio</Link>
        <Link href="/transacciones" className={`${item} ${activo("/transacciones")}`}><Landmark className="h-5 w-5" aria-hidden /> Saldos</Link>
        {cuentas.length > 0 && (
          <button type="button" className={`${item} text-primary`} onClick={() => { setUltima(leerUltima()); setEligiendo(true); }} data-registrar-pago>
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg">
              <Plus className="h-6 w-6" aria-hidden />
            </span>
            Registrar
          </button>
        )}
        {esTitular && (
          <Link href="/pagos-programados?nuevo=1" className={`${item} text-muted`} data-programar>
            <CalendarPlus className="h-5 w-5" aria-hidden /> Programar
          </Link>
        )}
        <Link href="/pagos-programados" className={`${item} ${ruta.startsWith("/pagos-programados") ? "text-primary" : "text-muted"}`}>
          <CalendarClock className="h-5 w-5" aria-hidden /> Por pagar
        </Link>
      </nav>

      {eligiendo && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="¿En qué cuenta?">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEligiendo(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">¿En qué cuenta registras el movimiento?</h2>
              <button className="btn-ghost p-2" onClick={() => setEligiendo(false)} aria-label="Cerrar"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <ul className="divide-y divide-border">
              {ordenadas.map((c) => (
                <li key={c.cuenta_id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => elegir(c.cuenta_id)} data-cuenta-rapida={c.cuenta_id}>
                    <span className="min-w-0 truncate font-medium">
                      {c.nombre}
                      {c.cuenta_id === ultima && <span className="ml-2 text-xs font-normal text-muted">la última que usaste</span>}
                    </span>
                    <span className={`num shrink-0 text-sm ${c.saldo < 0 ? "text-danger" : "text-muted"}`}>{dinero(c.saldo, c.moneda)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
