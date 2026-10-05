"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoCambio = { error?: string };

export async function cambiarContrasena(_prev: EstadoCambio, formData: FormData): Promise<EstadoCambio> {
  const nueva = String(formData.get("nueva") ?? "");
  const repetida = String(formData.get("repetida") ?? "");
  if (nueva.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) return { error: "Usa letras y números." };
  if (nueva !== repetida) return { error: "Las dos contraseñas no coinciden." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password: nueva, data: { debe_cambiar: false } });
  if (error) {
    return { error: /same|different/i.test(error.message) ? "La nueva contraseña debe ser distinta a la anterior." : `No se pudo cambiar (${error.message}).` };
  }
  redirect("/");
}
