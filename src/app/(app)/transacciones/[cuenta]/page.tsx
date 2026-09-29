import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { dinero } from "@/lib/formato";
import { leerFiltros, parametrosBusqueda, POR_PAGINA, type Movimiento, type SaldoCuenta } from "@/lib/transacciones";
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
  const filtros = leerFiltros(await props.searchParams);

  const perfil = await obtenerPerfil();
  const supabase = await createClient();

  const [cuentaR, movsR, conceptosR, proveedoresR, clasifR, cuentasR] = await Promise.all([
    supabase.from("v_saldos_cuentas").select("*").eq("cuenta_id", cuentaId).maybeSingle(),
    supabase.rpc("buscar_transacciones", parametrosBusqueda(cuentaId, filtros)),
    supabase.from("conceptos").select("id, nombre, activo").order("nombre").limit(5000),
    supabase.from("proveedores").select("id, nombre, apellido_paterno, apellido_materno, razon_social, activo").order("nombre").limit(5000),
    supabase.from("clasificaciones").select("id, nombre, color, activo").order("nombre"),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
  ]);

  const cuenta = cuentaR.data as SaldoCuenta | null;
  if (!cuenta) notFound();
  const movimientos = (movsR.data ?? []) as Movimiento[];
  const total = movimientos[0]?.total ?? 0;

  type Prov = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; razon_social: string | null; activo: boolean };
  const proveedores = ((proveedoresR.data ?? []) as Prov[]).map((p) => {
    const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(" ");
    return { valor: String(p.id), etiqueta: p.razon_social || nombre, activo: p.activo };
  });
  const conceptos = ((conceptosR.data ?? []) as { id: number; nombre: string; activo: boolean }[]).map((c) => ({
    valor: String(c.id), etiqueta: c.nombre, activo: c.activo,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/transacciones" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas las cuentas
      </Link>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{cuenta.nombre}</h1>
          <p className="mt-1 text-sm text-muted">
            {[cuenta.banco, cuenta.tipo_cuenta, cuenta.moneda].filter(Boolean).join(" · ")}
            {!cuenta.activa && " · cuenta inactiva"}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted">Saldo actual</p>
          <p className={`num text-3xl font-semibold ${Number(cuenta.saldo) < 0 ? "text-danger" : "text-primary"}`}>
            {dinero(cuenta.saldo, cuenta.moneda)}
          </p>
        </div>
      </header>

      {movsR.error ? (
        <p className="card p-6 text-sm text-danger">No se pudieron cargar los movimientos: {movsR.error.message}</p>
      ) : (
        <MovimientosVista
          cuenta={cuenta}
          movimientos={movimientos}
          total={Number(total)}
          totalCargos={Number(movimientos[0]?.total_cargos ?? 0)}
          totalAbonos={Number(movimientos[0]?.total_abonos ?? 0)}
          filtros={filtros}
          porPagina={POR_PAGINA}
          conceptos={conceptos}
          proveedores={proveedores}
          clasificaciones={(clasifR.data ?? []) as { id: number; nombre: string; color: string; activo: boolean }[]}
          cuentas={((cuentasR.data ?? []) as Pick<SaldoCuenta, "cuenta_id" | "nombre" | "moneda" | "activa">[]).filter((c) => c.cuenta_id !== cuentaId)}
          puedeEditar={perfil.rol === "titular"}
        />
      )}
    </div>
  );
}
