"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Search } from "lucide-react";
import type { Propuesta } from "@/lib/importador/proponer";
import { crearReglas } from "./actions";

export default function ProponerVista({ propuestas, proveedores, conceptos }: {
  propuestas: Propuesta[];
  proveedores: Record<number, string>;
  conceptos: Record<number, string>;
}) {
  const router = useRouter();
  const clave = (p: Propuesta) => `${p.tipo}|${p.clave}`;
  const [marcadas, setMarcadas] = useState(() => new Set(propuestas.filter((p) => p.recomendada).map(clave)));
  const [busqueda, setBusqueda] = useState("");
  const [resultado, setResultado] = useState<{ creadas?: number; error?: string }>();
  const [guardando, startGuardar] = useTransition();

  const q = busqueda.trim().toUpperCase();
  const visibles = useMemo(() => propuestas.filter((p) => !q || p.clave.includes(q)
    || (p.proveedor_id && proveedores[p.proveedor_id]?.toUpperCase().includes(q))
    || (p.concepto_id && conceptos[p.concepto_id]?.toUpperCase().includes(q))), [propuestas, q, proveedores, conceptos]);
  const alternar = (k: string) => setMarcadas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (resultado?.creadas !== undefined && !resultado.error) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-ok" aria-hidden />
        <p className="text-lg font-semibold">Se crearon {resultado.creadas} reglas</p>
        <div className="flex gap-2">
          <Link href="/catalogos/reglas" className="btn-primary">Ver las reglas</Link>
          <Link href="/importar" className="btn-secondary">Ir al importador</Link>
        </div>
      </div>
    );
  }
  if (!propuestas.length) return <p className="card p-6 text-sm text-muted">No hay comercios nuevos que se hayan clasificado siempre igual. Las reglas se irán creando solas al importar.</p>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="pr-buscar" className="sr-only">Buscar</label>
          <input id="pr-buscar" type="search" className="input pl-9" placeholder="Buscar comercio, A favor de o concepto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <span className="text-sm text-muted">{propuestas.length} propuestas · las recomendadas ya vienen palomeadas</span>
        <span className="ml-auto flex gap-2">
          <button className="btn-ghost px-2 py-1" onClick={() => setMarcadas(new Set(propuestas.filter((p) => p.recomendada).map(clave)))}>Solo recomendadas</button>
          <button className="btn-ghost px-2 py-1" onClick={() => setMarcadas(new Set())}>Ninguna</button>
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2"><span className="sr-only">Crear</span></th>
              <th className="px-3 py-2 font-medium">Comercio</th>
              <th className="px-3 py-2 font-medium">Aplica a</th>
              <th className="px-3 py-2 text-right font-medium">Movs.</th>
              <th className="px-3 py-2 font-medium">A favor de</th>
              <th className="px-3 py-2 font-medium">Concepto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.map((p) => {
              const k = clave(p);
              return (
                <tr key={k} className={marcadas.has(k) ? "" : "opacity-60"} data-propuesta={p.clave}>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={marcadas.has(k)} onChange={() => alternar(k)} aria-label={`Crear regla ${p.clave}`} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.clave}</td>
                  <td className="px-3 py-2 text-xs text-muted">{p.tipo === "abono" ? "Abonos" : "Cargos"}</td>
                  <td className="num px-3 py-2 text-right">{p.movimientos}</td>
                  <td className="px-3 py-2">{p.proveedor_id ? <>{proveedores[p.proveedor_id] ?? `#${p.proveedor_id}`} <span className="text-xs text-muted">{p.proveedor_pct}%</span></> : <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2">{p.concepto_id ? <>{conceptos[p.concepto_id] ?? `#${p.concepto_id}`} <span className="text-xs text-muted">{p.concepto_pct}%</span></> : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">El porcentaje indica en cuántos de esos movimientos se usó ese valor. Lo que no tenga al menos 80–90 % no se propone.</p>
      {resultado?.error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{resultado.error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="text-sm"><strong>{marcadas.size}</strong> reglas por crear</p>
          <button className="btn-primary ml-auto" disabled={guardando || !marcadas.size}
            onClick={() => startGuardar(async () => {
              const r = await crearReglas(propuestas.filter((p) => marcadas.has(clave(p))).map((p) => ({
                clave: p.clave, tipo: p.tipo, proveedor_id: p.proveedor_id, concepto_id: p.concepto_id, movimientos: p.movimientos,
              })));
              setResultado(r);
              router.refresh();
            })}>
            {guardando ? "Creando…" : `Crear ${marcadas.size} reglas`}
          </button>
        </div>
      </div>
    </div>
  );
}
