"use client";

import Link from "next/link";
import { useState } from "react";
import { Filter, Search } from "lucide-react";
import Combobox, { type OpcionCombo } from "@/components/Combobox";
import type { CuentaCorta, Filtros } from "@/lib/transacciones";
import type { Clasif } from "./TablaMovimientos";

// Filtros en un formulario normal: quedan en la dirección y se pueden guardar como favorito.
export default function FiltrosMovimientos({
  accion, filtros, conceptos, proveedores, clasificaciones, cuentas,
}: {
  accion: string;
  filtros: Filtros;
  conceptos: OpcionCombo[];
  proveedores: OpcionCombo[];
  clasificaciones: Clasif[];
  cuentas?: CuentaCorta[];        // solo en el reporte de varias cuentas
}) {
  const hayFiltros = !!(filtros.desde || filtros.hasta || filtros.texto || filtros.concepto || filtros.proveedor
    || filtros.clasificaciones?.length || filtros.tipo || filtros.cuentas?.length);
  const [elegidas, setElegidas] = useState<number[]>(filtros.cuentas ?? []);
  const [verInactivas, setVerInactivas] = useState(false);
  const [clasifElegidas, setClasifElegidas] = useState<number[]>(filtros.clasificaciones ?? []);
  const [modo, setModo] = useState<"o" | "y">(filtros.modoClasif === "y" ? "y" : "o");

  return (
    <form method="get" action={accion} className="card mb-4 p-4" role="search" aria-label="Filtrar movimientos">
      {cuentas && (
        <fieldset className="mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="label mb-0">Cuentas</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setElegidas([])}>Todas</button>
              <label className="flex cursor-pointer items-center gap-1.5 text-muted">
                <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
                Mostrar inactivas
              </label>
            </div>
          </div>
          <input type="hidden" name="cuentas" value={elegidas.join(",")} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={elegidas.length === 0}
              onClick={() => setElegidas([])}
              className={`rounded-full border px-3 py-1 text-sm ${elegidas.length === 0 ? "border-primary bg-primary-soft font-medium text-primary" : "border-border"}`}
            >
              Todas las cuentas
            </button>
            {cuentas.filter((c) => c.activa || verInactivas || elegidas.includes(c.cuenta_id)).map((c) => {
              const activa = elegidas.includes(c.cuenta_id);
              return (
                <button
                  key={c.cuenta_id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setElegidas((e) => (activa ? e.filter((x) => x !== c.cuenta_id) : [...e, c.cuenta_id]))}
                  className={`rounded-full border px-3 py-1 text-sm ${activa ? "border-primary bg-primary-soft font-medium text-primary" : "border-border"} ${c.activa ? "" : "opacity-70"}`}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label htmlFor="f-texto" className="label">Buscar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="f-texto" name="texto" type="search" defaultValue={filtros.texto} className="input pl-9" placeholder="Folio, proveedor, leyendas, referencia, importe…" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <div>
            <label htmlFor="f-desde" className="label">Desde</label>
            <input id="f-desde" name="desde" type="date" defaultValue={filtros.desde} className="input" />
          </div>
          <div>
            <label htmlFor="f-hasta" className="label">Hasta</label>
            <input id="f-hasta" name="hasta" type="date" defaultValue={filtros.hasta} className="input" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1 lg:flex-none"><Filter className="h-4 w-4" aria-hidden /> Filtrar</button>
          {hayFiltros && <Link href={accion} className="btn-secondary">Limpiar</Link>}
        </div>
      </div>
      <details className="mt-3" open={!!(filtros.concepto || filtros.proveedor || filtros.clasificaciones?.length || filtros.tipo)}>
        <summary className="cursor-pointer text-sm font-medium text-primary">Más filtros</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="f-tipo" className="label">Tipo</label>
            <select id="f-tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className="input">
              <option value="">Cargos y abonos</option>
              <option value="cargos">Solo cargos</option>
              <option value="abonos">Solo abonos</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-concepto" className="label">Concepto</label>
            <Combobox id="f-concepto" nombre="concepto" opciones={conceptos} valorInicial={filtros.concepto ? String(filtros.concepto) : ""} placeholder="Todos" />
          </div>
          <div>
            <label htmlFor="f-proveedor" className="label">A favor de</label>
            <Combobox id="f-proveedor" nombre="proveedor" opciones={proveedores} valorInicial={filtros.proveedor ? String(filtros.proveedor) : ""} placeholder="Todos" />
          </div>
          <fieldset className="sm:col-span-2 lg:col-span-4" data-filtro-clasif>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <legend className="label mb-0">Clasificaciones {clasifElegidas.length > 0 && <span className="badge bg-accent-soft text-accent-strong">{clasifElegidas.length}</span>}</legend>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Cómo combinar las clasificaciones">
                  <button type="button" aria-pressed={modo !== "y"} onClick={() => setModo("o")} data-modo="o"
                    className={`rounded-md px-3 py-1 ${modo !== "y" ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"}`}>
                    O · cualquiera
                  </button>
                  <button type="button" aria-pressed={modo === "y"} onClick={() => setModo("y")} data-modo="y"
                    className={`rounded-md px-3 py-1 ${modo === "y" ? "bg-primary font-semibold text-white" : "text-muted hover:text-text"}`}>
                    Y · todas
                  </button>
                </div>
                {clasifElegidas.length > 0 && <button type="button" className="font-medium text-primary hover:underline" onClick={() => setClasifElegidas([])}>Quitar</button>}
              </div>
            </div>
            <input type="hidden" name="clasificaciones" value={clasifElegidas.join(",")} />
            {modo === "y" && <input type="hidden" name="modoClasif" value="y" />}
            <div className="flex flex-wrap gap-2">
              {clasificaciones.filter((c) => c.activo || clasifElegidas.includes(c.id)).map((c) => {
                const activa = clasifElegidas.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={activa} data-clasif={c.id}
                    onClick={() => setClasifElegidas((e) => (activa ? e.filter((x) => x !== c.id) : [...e, c.id]))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${activa ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border hover:bg-surface-2"}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />{c.nombre}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              {clasifElegidas.length < 2
                ? "Elige una o varias. Con «O» salen los movimientos que tengan cualquiera de ellas; con «Y», solo los que tengan todas."
                : modo === "y"
                  ? "Solo movimientos que tengan TODAS las clasificaciones elegidas."
                  : "Movimientos que tengan CUALQUIERA de las clasificaciones elegidas."}
            </p>
          </fieldset>
        </div>
      </details>
    </form>
  );
}
