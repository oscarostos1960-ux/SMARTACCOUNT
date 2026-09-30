import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Rol = "titular" | "usuario" | "pendiente";
export type Perfil = { id: string; nombre: string; correo: string | null; rol: Rol };
export type Nivel = "ver" | "editar";

// Usuario y perfil actuales (una sola consulta por petición).
export const obtenerPerfil = cache(async (): Promise<Perfil> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("perfiles").select("id,nombre,correo,rol").eq("id", user.id).single();
  return (data as Perfil) ?? { id: user.id, nombre: user.email ?? "", correo: user.email ?? null, rol: "pendiente" };
});

export async function exigirTitular() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") throw new Error("Solo el titular puede hacer cambios.");
  return perfil;
}

// Permisos del usuario actual por cuenta. El titular puede todo.
export const obtenerPermisos = cache(async () => {
  const perfil = await obtenerPerfil();
  const esTitular = perfil.rol === "titular";
  const porCuenta = new Map<number, Nivel>();
  if (!esTitular && perfil.rol === "usuario") {
    const supabase = await createClient();
    const { data } = await supabase.from("permisos_cuenta").select("cuenta_id, nivel").eq("usuario_id", perfil.id);
    for (const p of data ?? []) porCuenta.set(Number(p.cuenta_id), p.nivel as Nivel);
  }
  return {
    perfil,
    esTitular,
    puedeEditar: (cuentaId: number) => esTitular || porCuenta.get(cuentaId) === "editar",
    algunaEditable: esTitular || [...porCuenta.values()].includes("editar"),
    editables: [...porCuenta].filter(([, n]) => n === "editar").map(([c]) => c),
  };
});
