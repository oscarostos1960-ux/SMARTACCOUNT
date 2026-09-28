import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Rol = "titular" | "contador" | "pendiente";
export type Perfil = { id: string; nombre: string; correo: string | null; rol: Rol };

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
