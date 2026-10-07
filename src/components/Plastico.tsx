import Link from "next/link";
import { dinero, fecha } from "@/lib/formato";
import type { SaldoCuenta } from "@/lib/transacciones";

// Color del "plástico" de cada tarjeta: dorado para las ORO y una paleta propia para las demás
// (no se copian los diseños de los bancos).
const CARAS = [
  "linear-gradient(135deg, #24365c 0%, #15213b 100%)",
  "linear-gradient(135deg, #3f444d 0%, #22252b 100%)",
  "linear-gradient(135deg, #2f6655 0%, #1b3f34 100%)",
  "linear-gradient(135deg, #6c2b3a 0%, #441724 100%)",
  "linear-gradient(135deg, #4b3a7a 0%, #2c2150 100%)",
  "linear-gradient(135deg, #2c5a7a 0%, #183a52 100%)",
];
const DORADAS = ["linear-gradient(135deg, #b8862e 0%, #7d5612 100%)", "linear-gradient(135deg, #a3782a 0%, #6f4d14 100%)"];

// i = lugar de la tarjeta en la lista, para que dos tarjetas seguidas no salgan del mismo color
export function caraTarjeta(nombre: string, i: number) {
  return /\bORO\b/i.test(nombre) ? DORADAS[i % DORADAS.length] : CARAS[i % CARAS.length];
}

function Chip() {
  return <span className="h-8 w-10 shrink-0 rounded-md bg-[#e9c46a] shadow-[inset_0_0_0_1px_rgba(120,80,0,0.35)]" aria-hidden />;
}
function SinContacto() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0 opacity-85">
      <path d="M8.5 7.5a6 6 0 0 1 0 9" /><path d="M12 5a9.5 9.5 0 0 1 0 14" /><path d="M15.5 2.5a13 13 0 0 1 0 19" />
    </svg>
  );
}

// Tarjeta de crédito con aspecto de plástico (lleva al detalle de la cuenta)
export default function Plastico({ c, i }: { c: SaldoCuenta; i: number }) {
  return (
    <Link href={`/transacciones/${c.cuenta_id}`} data-plastico
      className={`flex aspect-[1.586] flex-col justify-between rounded-2xl p-5 text-white shadow-[0_10px_22px_rgba(31,36,48,0.18),inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform hover:-translate-y-0.5 ${c.activa ? "" : "opacity-60"}`}
      style={{ background: caraTarjeta(c.nombre, i) }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/80">{c.banco ?? "Tarjeta"}</p>
          <p className="truncate text-base font-extrabold">{c.nombre}</p>
        </div>
        <SinContacto />
      </div>
      <div className="flex items-center gap-4">
        <Chip />
        <span className="num text-[15px] tracking-[0.16em]" data-terminacion>•••• •••• •••• {c.terminacion ?? "····"}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/75">Saldo</p>
          <p className="num text-2xl font-extrabold">{dinero(c.saldo, c.moneda)}</p>
        </div>
        <p className="text-right text-[11px] text-white/85">{c.ultimo_movimiento ? `último mov. ${fecha(c.ultimo_movimiento)}` : "sin movimientos"}</p>
      </div>
    </Link>
  );
}

// Encabezado de una cuenta: tarjeta de plástico para crédito, bloque azul para las demás
export function EncabezadoCuenta({ c, i = 0, detalle }: { c: SaldoCuenta; i?: number; detalle: string }) {
  const credito = c.naturaleza === "credito";
  return (
    <section aria-label="Saldo de la cuenta" data-encabezado-cuenta
      className="flex flex-col gap-4 rounded-2xl p-5 text-white shadow-[0_10px_22px_rgba(31,36,48,0.15)] sm:flex-row sm:items-center sm:justify-between sm:p-6"
      style={{ background: credito ? caraTarjeta(c.nombre, i) : "var(--primary)" }}>
      <div className="flex min-w-0 items-center gap-4">
        {credito && <Chip />}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/80">{detalle}</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{c.nombre}</h1>
          {c.terminacion && <p className="num mt-0.5 text-sm tracking-[0.16em] text-white/90">•••• {c.terminacion}</p>}
        </div>
      </div>
      <div className="sm:text-right">
        <p className="text-xs text-white/80">Saldo actual</p>
        <p className="num text-3xl font-extrabold">{dinero(c.saldo, c.moneda)}</p>
      </div>
    </section>
  );
}
