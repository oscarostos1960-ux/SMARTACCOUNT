import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { cargarCatalogosMovimiento } from "@/lib/catalogos-movimiento";
import type { CuentaCorta } from "@/lib/transacciones";
import ImportarVista, { type ImportacionResumen } from "./ImportarVista";
import CreditoIA from "./CreditoIA";

export const metadata: Metadata = { title: "Importar estados de cuenta" };
// La lectura con IA de un estado de cuenta largo puede tardar un par de minutos
export const maxDuration = 300;

export default async function ImportarPage() {
  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  const [cuentasR, impR, catalogos] = await Promise.all([
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
    supabase.from("importaciones")
      .select("id, archivo_nombre, archivo_tipo, estado, error, cuenta_id, banco, periodo_inicio, periodo_fin, movimientos_importados, created_at")
      .neq("estado", "descartado").order("created_at", { ascending: false }).limit(20),
    cargarCatalogosMovimiento(supabase),
  ]);
  const cuentas = ((cuentasR.data ?? []) as CuentaCorta[]).filter((c) => c.activa && permisos.puedeEditar(c.cuenta_id));

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Importar estados de cuenta</h1>
        <p className="mt-1 text-sm text-muted">Sube el PDF o XML de tu banco: la IA lee los movimientos, revisa que cuadren y te los muestra antes de guardarlos.</p>
      </header>
      {permisos.esTitular && <div className="mb-4"><Suspense fallback={null}><CreditoIA /></Suspense></div>}
      {cuentas.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No tienes cuentas en las que puedas capturar movimientos.</p>
      ) : (
        <ImportarVista
          usuarioId={permisos.perfil.id}
          puedeCrear={permisos.esTitular}
          cuentas={cuentas}
          historial={(impR.data ?? []) as ImportacionResumen[]}
          {...catalogos}
        />
      )}
    </div>
  );
}
