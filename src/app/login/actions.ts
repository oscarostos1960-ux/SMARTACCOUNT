"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; correo?: string };

export async function iniciarSesion(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!correo || !password) return { error: "Escribe tu correo y tu contraseña.", correo };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password });
  if (error) return { error: "Correo o contraseña incorrectos.", correo };
  redirect("/");
}
