import { redirect } from "next/navigation";
import { obtenerEspacio, obtenerPerfil, obtenerPermisos } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Navegacion from "@/components/Navegacion";
import BarraMovil, { type CuentaRapida } from "@/components/BarraMovil";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const perfil = await obtenerPerfil();
  if (perfil.debeCambiar) redirect("/cambiar-contrasena");

  if (perfil.rol === "pendiente") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Tu acceso está pendiente</h1>
          <p className="mt-2 text-sm text-muted">El titular de la cuenta debe asignarte permisos antes de que puedas ver la información.</p>
          <form action="/auth/salir" method="post" className="mt-6"><button className="btn-secondary">Salir</button></form>
        </div>
      </main>
    );
  }

  // Cuentas activas donde puede registrar movimientos (para el botón "Registrar" del celular)
  const [permisos, espacio] = await Promise.all([obtenerPermisos(), obtenerEspacio()]);
  const supabase = await createClient();
  const { data } = await supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, saldo, activa").eq("activa", true).order("nombre");
  const cuentasRapidas: CuentaRapida[] = (data ?? [])
    .filter((c) => permisos.puedeEditar(Number(c.cuenta_id)))
    .map((c) => ({ cuenta_id: Number(c.cuenta_id), nombre: String(c.nombre), moneda: String(c.moneda ?? "MXN"), saldo: Number(c.saldo ?? 0) }));

  return (
    <div className="min-h-screen">
      <Navegacion nombre={perfil.nombre} rol={perfil.rol} espacio={espacio.principal ? null : espacio.nombre} />
      <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
      <BarraMovil cuentas={cuentasRapidas} esTitular={permisos.esTitular} />
    </div>
  );
}
