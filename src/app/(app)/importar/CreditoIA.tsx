import "server-only";
import { gateway } from "ai";
import { ExternalLink, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Saldo del crédito de IA (Vercel AI Gateway) con el que se leen los estados de cuenta.
// Si no se puede consultar (sin conexión, sin llave), simplemente no se muestra.
async function leerCredito(): Promise<{ saldo: number; usado: number } | null> {
  const simulado = process.env.CREDITO_IA_SIMULADO;   // solo para pruebas: "saldo|usado"
  if (simulado) { const [s, u] = simulado.split("|").map(Number); return { saldo: s, usado: u }; }
  if (process.env.IMPORTADOR_SIMULADO) return null;
  try {
    const r = await Promise.race([
      gateway.getCredits(),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("tiempo")), 4000)),
    ]);
    const saldo = Number(r.balance), usado = Number(r.totalUsed);
    return Number.isFinite(saldo) && Number.isFinite(usado) ? { saldo, usado } : null;
  } catch {
    return null;
  }
}

// Página de Vercel donde se compra más crédito (AI Gateway → botón del saldo, arriba a la derecha)
const URL_RECARGA = process.env.NEXT_PUBLIC_URL_RECARGA_IA || "https://vercel.com/micarteraia2/~/ai-gateway";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

export default async function CreditoIA() {
  const credito = await leerCredito();
  if (!credito) return null;
  const { saldo, usado } = credito;
  const total = saldo + usado;
  const pct = total > 0 ? Math.max(0, Math.min(100, (saldo / total) * 100)) : 0;
  // Costo promedio por lectura, con las lecturas que ha hecho la IA (cada archivo subido es una lectura)
  const supabase = await createClient();
  const { count } = await supabase.from("importaciones").select("id", { count: "exact", head: true }).neq("modelo", "simulado");
  const lecturas = count ?? 0;
  const porLectura = lecturas > 0 ? usado / lecturas : null;
  const alcanza = porLectura && porLectura > 0 ? Math.floor(saldo / porLectura) : null;
  const tono = pct < 10 ? "text-danger" : pct < 25 ? "text-warn" : "text-ok";
  const barra = pct < 10 ? "bg-danger" : pct < 25 ? "bg-warn" : "bg-ok";

  return (
    <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm" aria-label="Crédito de IA" data-credito-ia>
      <p className="flex items-center gap-1.5 font-medium"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Crédito de IA</p>
      <div className="min-w-48 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`num font-semibold ${tono}`} data-saldo>{usd(saldo)} disponibles</span>
          <span className="num text-xs text-muted">usado {usd(usado)} de {usd(total)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Crédito disponible">
          <div className={`h-full rounded-full ${barra}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {porLectura !== null && (
        <p className="text-xs text-muted" data-por-lectura>
          ≈ {usd(porLectura)} por estado de cuenta{alcanza !== null && <> · alcanza para unos <strong className="text-text">{alcanza.toLocaleString("es-MX")}</strong> más</>}
        </p>
      )}
      <a href={URL_RECARGA} target="_blank" rel="noopener noreferrer" data-recargar-ia
        className={`${pct < 25 ? "btn-primary" : "btn-secondary"} shrink-0 text-sm`}
        title="Abre Vercel: en AI Gateway haz clic en el saldo (arriba a la derecha) para agregar crédito">
        Recargar crédito <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </section>
  );
}
