import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil, type Perfil } from "@/lib/auth";
import UsuariosVista from "./UsuariosVista";

export const metadata: Metadata = { title: "Usuarios y permisos" };

export default async function UsuariosPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("perfiles").select("id,nombre,correo,rol").order("nombre");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Administración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-muted">
          <strong>Titular</strong>: control total. <strong>Contador</strong>: puede ver todo y sacar reportes, pero no modificar nada.
        </p>
      </header>
      <UsuariosVista usuarios={(data ?? []) as Perfil[]} yo={perfil.id} />
    </div>
  );
}
