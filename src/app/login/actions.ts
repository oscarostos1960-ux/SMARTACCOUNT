"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; correo?: string };

export async function iniciarSesion(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!correo || !password) return { error: "Escribe tu correo y tu contraseña.", correo };

  const supabase = await createClient();
  let { error } = await supabase.auth.signInWithPassword({ email: correo, password });
  // Al copiar la contraseña de un mensaje (WhatsApp) a veces se cuelan espacios o el punto final
  // y en el celular la primera letra de una contraseña temporal (smart-1234-abcd) puede salir en mayúscula o no
  const limpia = password.trim().replace(/[.,;:]+$/, "");
  const temporal = /^smart-\d{4}-[a-z]{4}$/i.test(limpia);
  const intentos = [...new Set([limpia, ...(temporal ? [limpia.toLowerCase(), "S" + limpia.slice(1).toLowerCase()] : [])])]
    .filter((x) => x && x !== password);
  for (const intento of intentos) {
    if (!error) break;
    ({ error } = await supabase.auth.signInWithPassword({ email: correo, password: intento }));
  }
  if (error) return { error: "Correo o contraseña incorrectos. Revisa mayúsculas y minúsculas; puedes tocar el ojo para ver lo que escribiste.", correo };
  redirect("/");
}
