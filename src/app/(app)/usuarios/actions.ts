"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirTitular } from "@/lib/auth";

export type Resultado = { ok?: string; error?: string };

export async function cambiarRol(id: string, rol: string): Promise<Resultado> {
  await exigirTitular();
  if (!["titular", "contador", "pendiente"].includes(rol)) return { error: "Rol no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ rol }).eq("id", id);
  if (error) return { error: error.message.includes("titular") ? error.message : "No se pudo cambiar el rol." };
  revalidatePath("/usuarios");
  return { ok: "Rol actualizado." };
}

export async function invitarUsuario(_prev: Resultado, formData: FormData): Promise<Resultado> {
  await exigirTitular();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "contador");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Correo no válido." };
  if (!["titular", "contador"].includes(rol)) return { error: "Rol no válido." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Las invitaciones aún no están activadas. Mientras tanto, agrega al usuario desde Supabase (Authentication → Users)." };
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, { data: { nombre: nombre || correo } });
  if (error || !data.user) return { error: "No se pudo enviar la invitación. ¿Ya existe ese usuario?" };

  // El trigger lo crea como "pendiente": se le asigna el rol elegido.
  const supabase = await createClient();
  await supabase.from("perfiles").update({ rol }).eq("id", data.user.id);
  revalidatePath("/usuarios");
  return { ok: `Invitación enviada a ${correo}.` };
}
