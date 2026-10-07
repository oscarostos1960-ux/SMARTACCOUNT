import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CreditCard, Landmark, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dinero, fecha, hoyCDMX } from "@/lib/formato";
import type { SaldoCuenta } from "@/lib/transacciones";

export const metadata: Metadata = { title: "Transacciones" };

const GRUPOS: { clave: string; titulo: string; naturalezas: (string | null)[]; tono: string; punto: string }[] = [
  { clave: "cheques", titulo: "Cheques y ahorro", naturalezas: ["cheques", "efectivo"], tono: "text-primary", punto: "bg-primary" },
  { clave: "credito", titulo: "Tarjetas de crédito", naturalezas: ["credito"], tono: "text-accent-strong", punto: "bg-accent-strong" },
  { clave: "otras", titulo: "Inversiones y otras", naturalezas: ["inversion", "otro", null], tono: "text-primary", punto: "bg-primary" },
];

// Color del "plástico" de cada tarjeta: dorado para las ORO y una paleta propia para las demás
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
function caraTarjeta(c: SaldoCuenta, i: number) {
  return /\bORO\b/i.test(c.nombre) ? DORADAS[i % DORADAS.length] : CARAS[i % CARAS.length];
}

function sumar(lista: SaldoCuenta[], moneda: string) {
  return lista.filter((c) => c.moneda === moneda).reduce((s, c) => s + Number(c.saldo), 0);
}

export default async function TransaccionesPage(props: PageProps<"/transacciones">) {
  const sp = await props.searchParams;
  const verInactivas = sp.inactivas === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_saldos_cuentas").select("*").order("nombre");
  const todas = (data ?? []) as SaldoCuenta[];
  const cuentas = todas.filter((c) => verInactivas || c.activa);
  const inactivas = todas.filter((c) => !c.activa).length;

  // Resumen (solo cuentas activas, en pesos; otras monedas aparte)
  const activas = todas.filter((c) => c.activa);
  const deGrupo = (clave: string) => activas.filter((c) => GRUPOS.find((g) => g.clave === clave)!.naturalezas.includes(c.naturaleza));
  const enCheques = sumar(deGrupo("cheques").concat(deGrupo("otras")), "MXN");
  const enTarjetas = sumar(deGrupo("credito"), "MXN");
  const nCheques = deGrupo("cheques").concat(deGrupo("otras")).filter((c) => c.moneda === "MXN").length;
  const nTarjetas = deGrupo("credito").filter((c) => c.moneda === "MXN").length;
  const otrasMonedas = [...new Set(activas.map((c) => c.moneda).filter((m) => m !== "MXN"))].map((m) => ({ moneda: m, total: sumar(activas, m) }));

  // Por pagar en los próximos 7 días (incluye vencidos)
  const hoy = hoyCDMX();
  const limite = new Date(`${hoy}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 7);
  const { data: porPagar } = await supabase.from("v_vencimientos").select("fecha, importe, moneda, tipo")
    .eq("estado", "pendiente").lte("fecha", limite.toISOString().slice(0, 10));
  const pagosSemana = (porPagar ?? []).filter((v) => v.moneda === "MXN" && v.tipo !== "abono");
  const totalSemana = pagosSemana.reduce((s, v) => s + Number(v.importe), 0);
  const vencidos = pagosSemana.filter((v) => String(v.fecha) < hoy).length;
  const fechaLarga = new Date(`${hoy}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const hoyTexto = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent-strong">{hoyTexto}</p>
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

      {activas.length > 0 && (
        <section aria-label="Resumen" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3" data-resumen-saldos>
          <div className="flex flex-col gap-1 rounded-2xl bg-primary px-5 py-5 text-white">
            <span className="flex items-center gap-1.5 text-sm text-white/80"><Landmark className="h-4 w-4" aria-hidden /> Dinero en cheques y ahorro</span>
            <span className="num text-3xl font-extrabold">{dinero(enCheques, "MXN")}</span>
            <span className="text-xs text-white/75">{nCheques} cuenta{nCheques === 1 ? "" : "s"} · MXN</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-accent-strong px-5 py-5 text-white">
            <span className="flex items-center gap-1.5 text-sm text-white/85"><CreditCard className="h-4 w-4" aria-hidden /> Deuda en tarjetas</span>
            <span className="num text-3xl font-extrabold">{dinero(enTarjetas, "MXN")}</span>
            <span className="text-xs text-white/80">{nTarjetas} tarjeta{nTarjetas === 1 ? "" : "s"} · MXN</span>
          </div>
          <Link href="/pagos-programados" className="card flex flex-col gap-1 px-5 py-5 transition-shadow hover:shadow-md">
            <span className="flex items-center gap-1.5 text-sm text-muted"><TrendingUp className="h-4 w-4" aria-hidden /> Por pagar esta semana</span>
            <span className="num text-3xl font-extrabold text-primary">{dinero(totalSemana, "MXN")}</span>
            <span className={`text-xs font-bold ${vencidos ? "text-danger" : "text-warn"}`}>
              {pagosSemana.length} pago{pagosSemana.length === 1 ? "" : "s"}{vencidos ? ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}` : ""}
            </span>
          </Link>
          {otrasMonedas.map((o) => (
            <div key={o.moneda} className="card flex flex-col gap-1 px-5 py-4 sm:col-span-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted">Cuentas en {o.moneda}</span>
              <span className={`num text-xl font-extrabold ${o.total < 0 ? "text-danger" : "text-primary"}`}>{dinero(o.total, o.moneda)}</span>
            </div>
          ))}
        </section>
      )}

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

// Tarjeta de crédito con aspecto de plástico
function Plastico({ c, i }: { c: SaldoCuenta; i: number }) {
  return (
    <Link href={`/transacciones/${c.cuenta_id}`} data-plastico
      className={`flex aspect-[1.586] flex-col justify-between rounded-2xl p-5 text-white shadow-[0_10px_22px_rgba(31,36,48,0.18),inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform hover:-translate-y-0.5 ${c.activa ? "" : "opacity-60"}`}
      style={{ background: caraTarjeta(c, i) }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/80">{c.banco ?? "Tarjeta"}</p>
          <p className="truncate text-base font-extrabold">{c.nombre}</p>
        </div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0 opacity-85">
          <path d="M8.5 7.5a6 6 0 0 1 0 9" /><path d="M12 5a9.5 9.5 0 0 1 0 14" /><path d="M15.5 2.5a13 13 0 0 1 0 19" />
        </svg>
      </div>
      <div className="flex items-center gap-4">
        <span className="h-8 w-10 rounded-md bg-[#e9c46a] shadow-[inset_0_0_0_1px_rgba(120,80,0,0.35)]" aria-hidden />
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
