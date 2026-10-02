import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { claveComercio, tipoMovimiento } from "./sugerencias";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type Propuesta = {
  clave: string; tipo: "cargo" | "abono"; movimientos: number;
  proveedor_id: number | null; proveedor_pct: number; concepto_id: number | null; concepto_pct: number;
  recomendada: boolean;
};

// Palabras que, solas, no identifican a un comercio
const NO_SOLAS = new Set(["CUENTA", "BANCARIO", "BANCARIA", "SU", "PAGO", "PAGOS", "TRANSF", "COMPRA", "CARGO", "ABONO", "DEPOSITO", "COBRO", "IVA", "COMISION", "COMISIONES", "INTERES", "INTERESES", "SEL", "SWEB", "SPEI", "TRASPASO", "TRASPASOS", "RETIRO", "CHEQUE", "ENVIO"]);

/** Reglas sugeridas a partir de los movimientos ya clasificados: comercios que siempre se clasificaron igual. */
export async function proponerReglas(supabase: Supa): Promise<Propuesta[]> {
  type Fila = { descripcion: string | null; leyenda1: string | null; cargo: number; abono: number; proveedor_id: number | null; concepto_id: number | null };
  const filas: Fila[] = [];
  for (let desde = 0; desde < 200000; desde += 1000) {
    const { data, error } = await supabase.from("transacciones").select("descripcion, leyenda1, cargo, abono, proveedor_id, concepto_id")
      .or("proveedor_id.not.is.null,concepto_id.not.is.null").order("id").range(desde, desde + 999);
    if (error || !data?.length) break;
    filas.push(...(data as Fila[]));
    if (data.length < 1000) break;
  }

  const { data: comodin0 } = await supabase.from("conceptos").select("id, nombre");
  const ignorados = new Set((comodin0 ?? []).filter((c) => ["?", "-", "SIN CONCEPTO"].includes(String(c.nombre).trim().toUpperCase())).map((c) => Number(c.id)));
  const ignorarConc = (id: number) => ignorados.has(Number(id));
  // Se cuenta cada comercio en todos sus niveles: "AMAZON", "AMAZON DIGITAL"…
  type Acum = { n: number; prov: Map<number, number>; conc: Map<number, number>; nProv: number; nConc: number };
  const grupos = new Map<string, Acum>();
  for (const f of filas) {
    const clave = claveComercio({ descripcion: f.descripcion ?? "", contraparte: f.leyenda1 });
    if (clave.length < 2) continue;
    const tipo = tipoMovimiento({ cargo: Number(f.cargo), abono: Number(f.abono) });
    const palabras = clave.split(" ");
    for (let n = 1; n <= palabras.length; n++) {
      const k = `${tipo}|${palabras.slice(0, n).join(" ")}`;
      const g = grupos.get(k) ?? { n: 0, prov: new Map(), conc: new Map(), nProv: 0, nConc: 0 };
      g.n++;
      if (f.proveedor_id) { g.nProv++; g.prov.set(Number(f.proveedor_id), (g.prov.get(Number(f.proveedor_id)) ?? 0) + 1); }
      if (f.concepto_id && !ignorarConc(f.concepto_id)) { g.nConc++; g.conc.set(Number(f.concepto_id), (g.conc.get(Number(f.concepto_id)) ?? 0) + 1); }
      grupos.set(k, g);
    }
  }

  const { data: ya } = await supabase.from("reglas_clasificacion").select("clave, tipo").limit(5000);
  const existentes = new Set((ya ?? []).map((r) => `${r.tipo}|${r.clave}`));
  const mejor = (m: Map<number, number>, total: number) => {
    const [id, c] = [...m].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return { id, pct: total ? c / total : 0, c };
  };

  // Del nivel más corto al más largo: si "IDMX" ya es consistente, no hace falta "IDMX JERCR"
  const cubiertas: string[] = [];
  const propuestas: Propuesta[] = [];
  const ordenadas = [...grupos].sort((a, b) => a[0].split(" ").length - b[0].split(" ").length || b[1].n - a[1].n);
  for (const [k, g] of ordenadas) {
    if (g.n < 2 || existentes.has(k)) continue;
    const [tipo, clave] = k.split("|") as ["cargo" | "abono", string];
    const palabras = clave.split(" ");
    if (palabras.length === 1 && (clave.length < 4 || NO_SOLAS.has(clave))) continue;
    if (cubiertas.some((c) => k === c || k.startsWith(`${c} `))) continue;
    const p = mejor(g.prov, g.nProv), c = mejor(g.conc, g.nConc);
    const provOk = p.id !== null && p.c >= 2 && p.pct >= 0.9;
    const concOk = c.id !== null && c.c >= 2 && c.pct >= 0.8;
    if (!provOk && !concOk) continue;
    // Solo cuenta como "cubierta" si el proveedor es consistente (si no, se prueban niveles más específicos)
    if (provOk) cubiertas.push(k);
    propuestas.push({
      clave, tipo, movimientos: g.n,
      proveedor_id: provOk ? p.id : null, proveedor_pct: provOk ? Math.round(p.pct * 100) : 0,
      concepto_id: concOk ? c.id : null, concepto_pct: concOk ? Math.round(c.pct * 100) : 0,
      recomendada: g.n >= 3 && provOk && p.pct >= 0.95,
    });
  }
  return propuestas.sort((a, b) => b.movimientos - a.movimientos).slice(0, 600);
}
