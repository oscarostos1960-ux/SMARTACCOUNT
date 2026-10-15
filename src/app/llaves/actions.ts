"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nuevoReto, origenActual, verificarEntrada, verificarRegistro, type DatosEntrada, type DatosRegistro } from "@/lib/llaves";

// Entrar con Face ID / huella (WebAuthn). Las llaves se guardan por usuario y por dispositivo.

export type Resultado = { ok?: boolean; error?: string };
export type Llave = { id: number; nombre: string | null; dominio: string; created_at: string; ultimo_uso: string | null };

// Opciones para activar Face ID / huella en este dispositivo (el usuario ya entró)
export async function opcionesRegistro() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Vuelve a entrar con tu contraseña." };
  const [{ data: perfil }, { data: llaves }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", user.id).maybeSingle(),
    supabase.from("llaves_acceso").select("credencial_id"),
  ]);
  const { dominio } = await origenActual();
  return {
    reto: await nuevoReto(),
    dominio,
    usuarioId: Buffer.from(user.id).toString("base64url"),
    correo: user.email ?? "",
    nombre: (perfil?.nombre as string | undefined) || user.email || "Usuario",
    excluir: (llaves ?? []).map((l) => l.credencial_id as string),
  };
}

export async function guardarLlave(datos: DatosRegistro, nombre: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Vuelve a entrar con tu contraseña." };
  try {
    const v = await verificarRegistro(datos);
    const { error } = await supabase.from("llaves_acceso").insert({ ...v, usuario_id: user.id, nombre: nombre.slice(0, 60) || null });
    if (error) return { error: error.code === "23505" ? "Este dispositivo ya estaba activado." : `No se pudo guardar (${error.message}).` };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo activar." };
  }
}

// Opciones para entrar (sin sesión): el reto; el teléfono elige la llave guardada para este sitio
export async function opcionesEntrada() {
  const { dominio } = await origenActual();
  return { reto: await nuevoReto(), dominio };
}

// Entrar: se verifica la firma y se abre la sesión de ese usuario
export async function entrarConLlave(datos: DatosEntrada): Promise<Resultado> {
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "Entrar con Face ID / huella no está disponible por ahora. Usa tu contraseña." }; }
  const { data: llave } = await admin.from("llaves_acceso")
    .select("id, usuario_id, clave_publica, algoritmo, contador, dominio").eq("credencial_id", datos.id).maybeSingle();
  if (!llave) return { error: "Este dispositivo ya no está activado. Entra con tu contraseña y vuelve a activarlo." };
  try {
    const { contador } = await verificarEntrada(datos, { ...llave, contador: Number(llave.contador) });
    await admin.from("llaves_acceso").update({ contador, ultimo_uso: new Date().toISOString() }).eq("id", llave.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo verificar tu identidad." };
  }
  // Sesión: liga de acceso de un solo uso, generada y canjeada aquí mismo (no se envía ningún correo)
  const { data: u } = await admin.auth.admin.getUserById(llave.usuario_id);
  const correo = u?.user?.email;
  if (!correo) return { error: "No se encontró tu usuario." };
  const { data: liga, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  const token = liga?.properties?.hashed_token;
  if (e1 || !token) return { error: "No se pudo abrir la sesión. Usa tu contraseña." };
  const supabase = await createClient();
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (e2) return { error: "No se pudo abrir la sesión. Usa tu contraseña." };
  redirect("/");
}

export async function misLlaves(): Promise<Llave[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("llaves_acceso").select("id, nombre, dominio, created_at, ultimo_uso").order("created_at");
  return (data ?? []) as Llave[];
}

export async function quitarLlave(id: number): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("llaves_acceso").delete().eq("id", id);
  return error ? { error: "No se pudo quitar." } : { ok: true };
}
