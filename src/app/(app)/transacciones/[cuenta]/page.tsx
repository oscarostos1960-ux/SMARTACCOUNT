import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { EncabezadoCuenta } from "@/components/Plastico";
import { cargarCatalogosMovimiento } from "@/lib/catalogos-movimiento";
import {
  leerFiltros, parametrosBusqueda, parametrosFiltro, POR_PAGINA,
  type CuentaCorta, type Movimiento, type SaldoCuenta, type Totales,
} from "@/lib/transacciones";
import MovimientosVista from "./MovimientosVista";

export async function generateMetadata(props: PageProps<"/transacciones/[cuenta]">): Promise<Metadata> {
  const { cuenta } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("cuentas").select("nombre").eq("id", Number(cuenta) || 0).maybeSingle();
  return { title: data?.nombre ?? "Movimientos" };
}

export default async function CuentaPage(props: PageProps<"/transacciones/[cuenta]">) {
  const { cuenta: param } = await props.params;
  const cuentaId = Number(param);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) notFound();
  const sp = await props.searchParams;
  const filtros = leerFiltros(sp);
  filtros.cuentas = undefined;

  const permisos = await obtenerPermisos();
  const supabase = await createClient();

  const [cuentaR, movsR, totR, folioR, catalogos, cuentasR] = await Promise.all([
    supabase.from("v_saldos_cuentas").select("*").eq("cuenta_id", cuentaId).maybeSingle(),
    supabase.rpc("buscar_movimientos_v2", parametrosBusqueda([cuentaId], filtros, "folio")),
    supabase.rpc("totales_movimientos_v2", parametrosFiltro([cuentaId], filtros)),
    supabase.from("transacciones").select("folio").eq("cuenta_id", cuentaId).order("folio", { ascending: false }).limit(1),
    cargarCatalogosMovimiento(supabase),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa, naturaleza").order("nombre"),
  ]);

  const cuenta = cuentaR.data as SaldoCuenta | null;
  if (!cuenta) notFound();
  const movimientos = (movsR.data ?? []) as Movimiento[];
  const siguienteFolio = Number(folioR.data?.[0]?.folio ?? 0) + 1;
  const puedeEditar = permisos.puedeEditar(cuentaId);
  // Mismo color de plástico que en la lista de saldos (lugar entre las tarjetas activas)
  const lugar = ((cuentasR.data ?? []) as { cuenta_id: number; activa: boolean; naturaleza: string | null }[])
    .filter((c) => c.activa && c.naturaleza === "credito").findIndex((c) => Number(c.cuenta_id) === cuentaId);
  const otras = ((cuentasR.data ?? []) as CuentaCorta[]).filter((c) => c.cuenta_id !== cuentaId && c.activa && permisos.puedeEditar(c.cuenta_id));

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/transacciones" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas las cuentas
      </Link>
      <div className="mb-6">
        <EncabezadoCuenta c={cuenta} i={Math.max(0, lugar)}
          detalle={[cuenta.banco, cuenta.tipo_cuenta, cuenta.moneda].filter(Boolean).join(" · ") + (!cuenta.activa ? " · cuenta inactiva" : "") + (!puedeEditar ? " · solo consulta" : "")} />
      </div>

      {movsR.error ? (
        <p className="card p-6 text-sm text-danger">No se pudieron cargar los movimientos: {movsR.error.message}</p>
      ) : (
        <MovimientosVista
          abrirNuevo={sp.nuevo === "1"}
          cuenta={{ cuenta_id: cuenta.cuenta_id, nombre: cuenta.nombre, moneda: cuenta.moneda, activa: cuenta.activa }}
          movimientos={movimientos}
          total={Number(movimientos[0]?.total ?? 0)}
          totales={(totR.data ?? []) as Totales[]}
          filtros={filtros}
          porPagina={POR_PAGINA}
          siguienteFolio={siguienteFolio}
          {...catalogos}
          cuentas={otras}
          puedeEditar={puedeEditar}
        />
      )}
    </div>
  );
}
