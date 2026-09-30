import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { cargarCatalogosMovimiento } from "@/lib/catalogos-movimiento";
import {
  leerFiltros, parametrosBusqueda, parametrosFiltro, POR_PAGINA,
  type CuentaCorta, type Movimiento, type Totales,
} from "@/lib/transacciones";
import ReporteVista from "./ReporteVista";

export const metadata: Metadata = { title: "Reporte de movimientos" };

export default async function ReportePage(props: PageProps<"/reporte">) {
  const filtros = leerFiltros(await props.searchParams);
  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  const cuentas = filtros.cuentas ?? null;

  const [movsR, totR, catalogos, cuentasR] = await Promise.all([
    supabase.rpc("buscar_movimientos", parametrosBusqueda(cuentas, filtros, "fecha")),
    supabase.rpc("totales_movimientos", parametrosFiltro(cuentas, filtros)),
    cargarCatalogosMovimiento(supabase),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
  ]);
  const listaCuentas = (cuentasR.data ?? []) as CuentaCorta[];
  const movimientos = (movsR.data ?? []) as Movimiento[];

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reporte de movimientos</h1>
        <p className="mt-1 text-sm text-muted">Busca en una, varias o todas tus cuentas a la vez. Elige las columnas y descárgalo a Excel.</p>
      </header>
      {movsR.error ? (
        <p className="card p-6 text-sm text-danger">No se pudo generar el reporte: {movsR.error.message}</p>
      ) : (
        <ReporteVista
          movimientos={movimientos}
          total={Number(movimientos[0]?.total ?? 0)}
          totales={(totR.data ?? []) as Totales[]}
          filtros={filtros}
          porPagina={POR_PAGINA}
          cuentas={listaCuentas}
          editables={permisos.esTitular ? listaCuentas.map((c) => c.cuenta_id) : permisos.editables}
          {...catalogos}
        />
      )}
    </div>
  );
}
