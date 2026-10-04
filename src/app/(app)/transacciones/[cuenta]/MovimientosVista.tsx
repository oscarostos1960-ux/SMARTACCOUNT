"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import FiltrosMovimientos from "@/components/movimientos/FiltrosMovimientos";
import TablaMovimientos, { type Clasif } from "@/components/movimientos/TablaMovimientos";
import { DialogoMovimiento, DialogoTransferencia, type Opcion } from "@/components/movimientos/DialogoMovimiento";
import {
  aConsulta, COLUMNAS_CUENTA, type CuentaCorta, type Filtros, type Movimiento, type Totales,
} from "@/lib/transacciones";

export default function MovimientosVista({
  cuenta, movimientos, total, totales, filtros, porPagina, siguienteFolio,
  conceptos, proveedores, clasificaciones, cuentas, puedeEditar, abrirNuevo = false,
}: {
  cuenta: CuentaCorta;
  movimientos: Movimiento[];
  total: number;
  totales: Totales[];
  filtros: Filtros;
  porPagina: number;
  siguienteFolio: number;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  cuentas: CuentaCorta[];
  puedeEditar: boolean;
  abrirNuevo?: boolean;   // ?nuevo=1: abre directo la captura (acceso rápido del celular)
}) {
  const [abierto, setAbierto] = useState<Movimiento | "nuevo" | "transferencia" | null>(puedeEditar && abrirNuevo ? "nuevo" : null);
  // Se quita ?nuevo=1 de la dirección para que al recargar no se vuelva a abrir
  useEffect(() => {
    if (!abrirNuevo) return;
    const u = new URL(window.location.href);
    u.searchParams.delete("nuevo");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [abrirNuevo]);
  const [version, setVersion] = useState(0);
  const base = `/transacciones/${cuenta.cuenta_id}`;
  const { pagina, ...sinPagina } = filtros;
  const hayFiltros = !!(filtros.desde || filtros.hasta || filtros.texto || filtros.concepto || filtros.proveedor || filtros.clasificacion || filtros.tipo);

  function abrir(m: Movimiento | "nuevo" | "transferencia") {
    setVersion((v) => v + 1);
    setAbierto(m);
  }

  return (
    <>
      <FiltrosMovimientos accion={base} filtros={filtros} conceptos={conceptos} proveedores={proveedores} clasificaciones={clasificaciones} />
      <TablaMovimientos
        movimientos={movimientos}
        total={total}
        totales={totales}
        pagina={pagina}
        porPagina={porPagina}
        enlacePagina={(n) => `${base}${aConsulta({ ...filtros, pagina: n })}`}
        enlaceExportar={(columnas) => `/movimientos/exportar${aConsulta({ ...sinPagina, cuentas: [cuenta.cuenta_id], columnas: columnas.join(","), orden: "folio" })}`}
        claveColumnas="sa-columnas-cuenta"
        columnasPorDefecto={COLUMNAS_CUENTA}
        clasificaciones={clasificaciones}
        onAbrir={abrir}
        puedeAdjuntar={puedeEditar ? () => true : undefined}
        vacio={hayFiltros
          ? { titulo: "Ningún movimiento coincide con los filtros", texto: "Prueba con otras fechas o palabras." }
          : { titulo: "Esta cuenta aún no tiene movimientos", texto: puedeEditar ? "Registra el primero con “Nuevo movimiento”." : undefined }}
        acciones={puedeEditar && (
          <>
            <button className="btn-secondary" onClick={() => abrir("transferencia")}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden /> Transferencia
            </button>
            <button className="btn-primary" onClick={() => abrir("nuevo")}>
              <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
            </button>
          </>
        )}
      />

      {abierto === "transferencia" && (
        <DialogoTransferencia key={version} cuenta={cuenta} cuentas={cuentas} conceptos={conceptos.filter((c) => c.activo)} onCerrar={() => setAbierto(null)} />
      )}
      {abierto && abierto !== "transferencia" && (
        <DialogoMovimiento
          key={version}
          cuenta={cuenta}
          movimiento={abierto === "nuevo" ? null : abierto}
          siguienteFolio={siguienteFolio}
          conceptos={conceptos}
          proveedores={proveedores}
          clasificaciones={clasificaciones}
          puedeEditar={puedeEditar}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}
