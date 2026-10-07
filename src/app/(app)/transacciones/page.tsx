import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dinero, fecha } from "@/lib/formato";
import type { SaldoCuenta } from "@/lib/transacciones";

export const metadata: Metadata = { title: "Transacciones" };


const GRUPOS: { titulo: string; naturalezas: (string | null)[] }[] = [
  { titulo: "Cuentas de cheques y ahorro", naturalezas: ["cheques", "efectivo"] },
  { titulo: "Tarjetas de crédito", naturalezas: ["credito"] },
  { titulo: "Inversiones y otras", naturalezas: ["inversion", "otro", null] },
];

export default async function TransaccionesPage(props: PageProps<"/transacciones">) {
  const sp = await props.searchParams;
  const verInactivas = sp.inactivas === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_saldos_cuentas").select("*").order("nombre");
  const todas = (data ?? []) as SaldoCuenta[];
  const cuentas = todas.filter((c) => verInactivas || c.activa);
  const inactivas = todas.filter((c) => !c.activa).length;

  // Totales por moneda (solo cuentas activas)
  const totales = new Map<string, number>();
  for (const c of todas.filter((c) => c.activa)) totales.set(c.moneda, (totales.get(c.moneda) ?? 0) + Number(c.saldo));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transacciones</h1>
          <p className="mt-1 text-sm text-muted">Elige una cuenta para ver y registrar sus movimientos.</p>
        </div>
        {inactivas > 0 && (
          <Link href={verInactivas ? "/transacciones" : "/transacciones?inactivas=1"} className="btn-secondary self-start sm:self-auto">
            {verInactivas ? "Ocultar cuentas inactivas" : `Ver cuentas inactivas (${inactivas})`}
          </Link>
        )}
      </header>

      {error && <p className="card mb-6 p-4 text-sm text-danger">No se pudieron cargar los saldos: {error.message}</p>}

      {totales.size > 0 && (
        <section aria-label="Saldo total de cuentas activas" className="mb-8 flex flex-wrap gap-3">
          {[...totales].map(([moneda, total]) => (
            <div key={moneda} className="card px-5 py-4">
              <p className="text-xs text-muted">Suma de cuentas activas ({moneda})</p>
              <p className={`num mt-1 text-xl font-semibold ${total < 0 ? "text-danger" : "text-primary"}`}>{dinero(total, moneda)}</p>
            </div>
          ))}
        </section>
      )}

      {GRUPOS.map((g) => {
        const lista = cuentas.filter((c) => g.naturalezas.includes(c.naturaleza));
        if (lista.length === 0) return null;
        return (
          <section key={g.titulo} className="mb-8" aria-labelledby={`g-${g.titulo}`}>
            <h2 id={`g-${g.titulo}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{g.titulo}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((c) => (
                <li key={c.cuenta_id}>
                  <Link href={`/transacciones/${c.cuenta_id}`} className={`card group flex h-full flex-col p-5 transition-shadow hover:shadow-md ${c.activa ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.nombre}</p>
                        <p className="truncate text-xs text-muted">
                          {[c.banco, c.tipo_cuenta, c.moneda].filter(Boolean).join(" · ")}
                          {c.terminacion && <> · <span className="num font-medium text-text" data-terminacion>•••• {c.terminacion}</span></>}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
                    </div>
                    <p className={`num mt-4 text-2xl font-semibold ${Number(c.saldo) < 0 ? "text-danger" : "text-primary"}`}>
                      {dinero(c.saldo, c.moneda)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {Number(c.movimientos).toLocaleString("es-MX")} movimientos
                      {c.ultimo_movimiento && <> · último el {fecha(c.ultimo_movimiento)}</>}
                      {!c.activa && " · inactiva"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
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
