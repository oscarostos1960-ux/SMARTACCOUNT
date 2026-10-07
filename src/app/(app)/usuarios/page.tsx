import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil, type Perfil } from "@/lib/auth";
import type { CuentaCorta } from "@/lib/transacciones";
import UsuariosVista, { type Permiso } from "./UsuariosVista";

export const metadata: Metadata = { title: "Usuarios y permisos" };

export default async function UsuariosPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") redirect("/");
  const supabase = await createClient();
  const [usuariosR, cuentasR, permisosR] = await Promise.all([
    supabase.from("perfiles").select("id,nombre,correo,rol").order("nombre"),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
    supabase.from("permisos_cuenta").select("usuario_id, cuenta_id, nivel"),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Administración</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-muted">
          <strong>Titular</strong>: control total. <strong>Acceso por cuenta</strong>: solo ve las cuentas que le asignes,
          y en cada una puede solo consultar o también capturar. <strong>Sin acceso</strong>: no ve nada.
        </p>
      </header>
      <UsuariosVista
        usuarios={(usuariosR.data ?? []) as Perfil[]}
        cuentas={(cuentasR.data ?? []) as CuentaCorta[]}
        permisos={(permisosR.data ?? []) as Permiso[]}
        yo={perfil.id}
      />
    </div>
  );
}
