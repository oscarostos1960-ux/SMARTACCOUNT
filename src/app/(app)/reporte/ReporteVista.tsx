"use client";

import { useState } from "react";
import FiltrosMovimientos from "@/components/movimientos/FiltrosMovimientos";
import TablaMovimientos, { type Clasif } from "@/components/movimientos/TablaMovimientos";
import { DialogoMovimiento, type Opcion } from "@/components/movimientos/DialogoMovimiento";
import {
  aConsulta, COLUMNAS_REPORTE, type CuentaCorta, type Filtros, type Movimiento, type Totales,
} from "@/lib/transacciones";

export default function ReporteVista({
  movimientos, total, totales, filtros, porPagina, cuentas, editables, conceptos, proveedores, clasificaciones,
}: {
  movimientos: Movimiento[];
  total: number;
  totales: Totales[];
  filtros: Filtros;
  porPagina: number;
  cuentas: CuentaCorta[];
  editables: number[];
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
}) {
  const [abierto, setAbierto] = useState<Movimiento | null>(null);
  const [version, setVersion] = useState(0);
  const { pagina, ...sinPagina } = filtros;
  const cuentaDe = (id: number) => cuentas.find((c) => c.cuenta_id === id);

  return (
    <>
      <FiltrosMovimientos accion="/reporte" filtros={filtros} conceptos={conceptos} proveedores={proveedores} clasificaciones={clasificaciones} cuentas={cuentas} />
      <TablaMovimientos
        movimientos={movimientos}
        total={total}
        totales={totales}
        pagina={pagina}
        porPagina={porPagina}
        enlacePagina={(n) => `/reporte${aConsulta({ ...filtros, pagina: n })}`}
        enlaceExportar={(columnas) => `/movimientos/exportar${aConsulta({ ...sinPagina, columnas: columnas.join(","), orden: "fecha" })}`}
        claveColumnas="sa-columnas-reporte"
        columnasPorDefecto={COLUMNAS_REPORTE}
        clasificaciones={clasificaciones}
        onAbrir={(m) => { setVersion((v) => v + 1); setAbierto(m); }}
        vacio={{ titulo: "Ningún movimiento coincide con los filtros", texto: "Prueba con otras cuentas, fechas o palabras." }}
      />
      {abierto && (
        <DialogoMovimiento
          key={version}
          cuenta={cuentaDe(abierto.cuenta_id) ?? { cuenta_id: abierto.cuenta_id, nombre: abierto.cuenta, moneda: abierto.moneda, activa: true }}
          movimiento={abierto}
          siguienteFolio={abierto.folio}
          conceptos={conceptos}
          proveedores={proveedores}
          clasificaciones={clasificaciones}
          puedeEditar={editables.includes(abierto.cuenta_id)}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}
