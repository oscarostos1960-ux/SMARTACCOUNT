import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dinero, fecha, hoyLargo } from "@/lib/formato";
import type { SaldoCuenta } from "@/lib/transacciones";
import Plastico from "@/components/Plastico";
import ResumenSaldos from "@/components/ResumenSaldos";

export const metadata: Metadata = { title: "Transacciones" };

const GRUPOS: { clave: string; titulo: string; naturalezas: (string | null)[]; tono: string; punto: string }[] = [
  { clave: "cheques", titulo: "Cheques y ahorro", naturalezas: ["cheques", "efectivo"], tono: "text-primary", punto: "bg-primary" },
  { clave: "credito", titulo: "Tarjetas de crédito", naturalezas: ["credito"], tono: "text-accent-strong", punto: "bg-accent-strong" },
  { clave: "otras", titulo: "Inversiones y otras", naturalezas: ["inversion", "otro", null], tono: "text-primary", punto: "bg-primary" },
];

export default async function TransaccionesPage(props: PageProps<"/transacciones">) {
  const sp = await props.searchParams;
  const verInactivas = sp.inactivas === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_saldos_cuentas").select("*").order("nombre");
  const todas = (data ?? []) as SaldoCuenta[];
  const cuentas = todas.filter((c) => verInactivas || c.activa);
  const inactivas = todas.filter((c) => !c.activa).length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent-strong">{hoyLargo()}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-primary">Mis cuentas</h1>
          <p className="mt-1 text-sm text-muted">Elige una cuenta para ver y registrar sus movimientos.</p>
        </div>
        {inactivas > 0 && (
          <Link href={verInactivas ? "/transacciones" : "/transacciones?inactivas=1"} className="btn-secondary self-start sm:self-auto">
            {verInactivas ? "Ocultar cuentas inactivas" : `Ver cuentas inactivas (${inactivas})`}
          </Link>
        )}
      </header>

      {error && <p className="card mb-6 p-4 text-sm text-danger">No se pudieron cargar los saldos: {error.message}</p>}

      <ResumenSaldos activas={todas.filter((c) => c.activa)} />

      {GRUPOS.map((g) => {
        const lista = cuentas.filter((c) => g.naturalezas.includes(c.naturaleza));
        if (lista.length === 0) return null;
        return (
          <section key={g.clave} className="mb-10" aria-labelledby={`g-${g.clave}`}>
            <h2 id={`g-${g.clave}`} className={`mb-4 flex items-center gap-2 text-base font-extrabold ${g.tono}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${g.punto}`} aria-hidden />{g.titulo}
            </h2>
            {g.clave === "credito" ? (
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((c, i) => <li key={c.cuenta_id}><Plastico c={c} i={i} /></li>)}
              </ul>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((c) => <li key={c.cuenta_id}><Tarjeta c={c} /></li>)}
              </ul>
            )}
          </section>
        );
      })}

      {cuentas.length === 0 && !error && (
        <div className="card px-6 py-16 text-center">
          <p className="font-medium">Aún no hay cuentas</p>
          <p className="mt-1 text-sm text-muted">Da de alta tus cuentas en Catálogos → Cuentas.</p>
        </div>
      )}
    </div>
  );
}

function ultimo(c: SaldoCuenta) {
  return `${Number(c.movimientos).toLocaleString("es-MX")} movimientos${c.ultimo_movimiento ? ` · último el ${fecha(c.ultimo_movimiento)}` : ""}${c.activa ? "" : " · inactiva"}`;
}

// Cuenta de cheques, ahorro o inversión
function Tarjeta({ c }: { c: SaldoCuenta }) {
  return (
    <Link href={`/transacciones/${c.cuenta_id}`} className={`card group flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-md ${c.activa ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Building2 className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="truncate font-bold">{c.nombre}</p>
          <p className="truncate text-xs text-muted">
            {[c.banco, c.tipo_cuenta, c.moneda].filter(Boolean).join(" · ")}
            {c.terminacion && <> · <span className="num font-semibold text-text" data-terminacion>•••• {c.terminacion}</span></>}
          </p>
        </div>
      </div>
      <p className={`num text-2xl font-extrabold ${Number(c.saldo) < 0 ? "text-danger" : "text-primary"}`}>{dinero(c.saldo, c.moneda)}</p>
      <p className="text-xs text-muted">{ultimo(c)}</p>
    </Link>
  );
}
