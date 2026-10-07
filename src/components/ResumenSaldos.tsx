import Link from "next/link";
import { CreditCard, Landmark, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dinero, hoyCDMX } from "@/lib/formato";
import type { SaldoCuenta } from "@/lib/transacciones";

const sumar = (lista: SaldoCuenta[], moneda: string) => lista.filter((c) => c.moneda === moneda).reduce((s, c) => s + Number(c.saldo), 0);

// Los tres recuadros de color: dinero en cheques, deuda en tarjetas y por pagar en 7 días (más otras monedas)
export default async function ResumenSaldos({ activas }: { activas: SaldoCuenta[] }) {
  if (!activas.length) return null;
  const supabase = await createClient();
  const credito = activas.filter((c) => c.naturaleza === "credito");
  const resto = activas.filter((c) => c.naturaleza !== "credito");
  const enCheques = sumar(resto, "MXN");
  const enTarjetas = sumar(credito, "MXN");
  const nCheques = resto.filter((c) => c.moneda === "MXN").length;
  const nTarjetas = credito.filter((c) => c.moneda === "MXN").length;
  const otrasMonedas = [...new Set(activas.map((c) => c.moneda).filter((m) => m !== "MXN"))].map((m) => ({ moneda: m, total: sumar(activas, m) }));

  // Por pagar en los próximos 7 días (incluye vencidos)
  const hoy = hoyCDMX();
  const limite = new Date(`${hoy}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 7);
  const { data: porPagar } = await supabase.from("v_vencimientos").select("fecha, importe, moneda, tipo")
    .eq("estado", "pendiente").lte("fecha", limite.toISOString().slice(0, 10));
  const pagosSemana = (porPagar ?? []).filter((v) => v.moneda === "MXN" && v.tipo !== "abono");
  const totalSemana = pagosSemana.reduce((s, v) => s + Number(v.importe), 0);
  const vencidos = pagosSemana.filter((v) => String(v.fecha) < hoy).length;

  return (
    <section aria-label="Resumen" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3" data-resumen-saldos>
      <Link href="/transacciones" className="flex flex-col gap-1 rounded-2xl bg-primary px-5 py-5 text-white transition-shadow hover:shadow-lg">
        <span className="flex items-center gap-1.5 text-sm text-white/80"><Landmark className="h-4 w-4" aria-hidden /> Dinero en cheques y ahorro</span>
        <span className="num text-3xl font-extrabold">{dinero(enCheques, "MXN")}</span>
        <span className="text-xs text-white/75">{nCheques} cuenta{nCheques === 1 ? "" : "s"} · MXN</span>
      </Link>
      <Link href="/transacciones#g-credito" className="flex flex-col gap-1 rounded-2xl bg-accent-strong px-5 py-5 text-white transition-shadow hover:shadow-lg">
        <span className="flex items-center gap-1.5 text-sm text-white/85"><CreditCard className="h-4 w-4" aria-hidden /> Deuda en tarjetas</span>
        <span className="num text-3xl font-extrabold">{dinero(enTarjetas, "MXN")}</span>
        <span className="text-xs text-white/80">{nTarjetas} tarjeta{nTarjetas === 1 ? "" : "s"} · MXN</span>
      </Link>
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
  );
}
