"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirTitular } from "@/lib/auth";

export type Resultado = { ok?: string; error?: string };
const ROLES = ["titular", "usuario", "pendiente"];

export async function cambiarRol(id: string, rol: string): Promise<Resultado> {
  await exigirTitular();
  if (!ROLES.includes(rol)) return { error: "Rol no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ rol }).eq("id", id);
  if (error) return { error: error.message.includes("titular") ? error.message : "No se pudo cambiar el rol." };
  revalidatePath("/usuarios");
  return { ok: "Rol actualizado." };
}

// nivel: "ver" | "editar" | "" (sin acceso)
export async function cambiarPermiso(usuarioId: string, cuentaIds: number[], nivel: string): Promise<Resultado> {
  await exigirTitular();
  if (!["ver", "editar", ""].includes(nivel)) return { error: "Permiso no válido." };
  const ids = cuentaIds.filter((c) => Number.isInteger(c) && c > 0);
  if (!ids.length) return {};
  const supabase = await createClient();
  const { error } = nivel
    ? await supabase.from("permisos_cuenta").upsert(ids.map((c) => ({ usuario_id: usuarioId, cuenta_id: c, nivel })))
    : await supabase.from("permisos_cuenta").delete().eq("usuario_id", usuarioId).in("cuenta_id", ids);
  if (error) return { error: "No se pudo guardar el permiso." };
  revalidatePath("/usuarios");
  return { ok: "Permisos guardados." };
}

export async function invitarUsuario(_prev: Resultado, formData: FormData): Promise<Resultado> {
  await exigirTitular();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "usuario");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Correo no válido." };
  if (!["titular", "usuario"].includes(rol)) return { error: "Rol no válido." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Las invitaciones aún no están activadas. Mientras tanto, agrega al usuario desde Supabase (Authentication → Users) y aquí le das permisos." };
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, { data: { nombre: nombre || correo } });
  if (error || !data.user) return { error: "No se pudo enviar la invitación. ¿Ya existe ese usuario?" };

  // El trigger lo crea como "pendiente": se le asigna el rol elegido.
  const supabase = await createClient();
  await supabase.from("perfiles").update({ rol }).eq("id", data.user.id);
  revalidatePath("/usuarios");
  return { ok: `Invitación enviada a ${correo}. Ahora elige a qué cuentas tendrá acceso.` };
}
