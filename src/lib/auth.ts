import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Rol = "titular" | "usuario" | "pendiente";
export type Perfil = { id: string; nombre: string; correo: string | null; rol: Rol; espacio_id: number; debeCambiar?: boolean };
export type Nivel = "ver" | "editar";

// Usuario y perfil actuales (una sola consulta por petición).
export const obtenerPerfil = cache(async (): Promise<Perfil> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("perfiles").select("id,nombre,correo,rol,espacio_id").eq("id", user.id).single();
  const debeCambiar = user.user_metadata?.debe_cambiar === true;   // contraseña temporal sin cambiar
  return { ...((data as Perfil) ?? { id: user.id, nombre: user.email ?? "", correo: user.email ?? null, rol: "pendiente", espacio_id: 0 }), debeCambiar };
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

// Espacio (datos propios) del usuario actual. El "principal" es el de Oscar: usa su crédito de IA y su correo.
export type Espacio = {
  id: number; nombre: string; principal: boolean; titular_id: string | null;
  correo_remitente: string | null; correo_nombre: string | null; smtp_host: string | null; smtp_puerto: number | null;
  smtp_activo: boolean; ia_clave_fin: string | null;
};
export const COLUMNAS_ESPACIO = "id,nombre,principal,titular_id,correo_remitente,correo_nombre,smtp_host,smtp_puerto,smtp_activo,ia_clave_fin";

export const obtenerEspacio = cache(async (): Promise<Espacio> => {
  const perfil = await obtenerPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("espacios").select(COLUMNAS_ESPACIO).eq("id", perfil.espacio_id).maybeSingle();
  return (data as Espacio | null) ?? {
    id: perfil.espacio_id, nombre: perfil.nombre, principal: false, titular_id: null, correo_remitente: null,
    correo_nombre: null, smtp_host: null, smtp_puerto: null, smtp_activo: false, ia_clave_fin: null,
  };
});

// Administrador general: titular del espacio principal (puede crear clientes con espacio propio).
export async function esAdmin() {
  const [perfil, espacio] = await Promise.all([obtenerPerfil(), obtenerEspacio()]);
  return perfil.rol === "titular" && espacio.principal;
}
