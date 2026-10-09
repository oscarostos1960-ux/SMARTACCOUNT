import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Claves de IA y contraseñas de correo de cada espacio.
// Se guardan cifradas (AES-256-GCM) en espacio_secretos, tabla a la que solo entra el servidor.
// La llave de cifrado sale de CLAVE_CIFRADO (si existe en Vercel) o de la llave de servicio de Supabase.
// Si esa llave cambia, los secretos ya no se pueden leer y el cliente tiene que volver a capturarlos.

type Campo = "ia_clave" | "smtp_contrasena";

function llave() {
  const base = process.env.CLAVE_CIFRADO || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.");
  return createHash("sha256").update(`smartaccount-secretos:${base}`).digest();
}

export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${datos.toString("base64")}`;
}

export function descifrar(valor: string): string | null {
  try {
    const [v, iv, tag, datos] = valor.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", llave(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(datos, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function guardarSecreto(espacioId: number, campo: Campo, valor: string | null) {
  const admin = createAdminClient();
  const { error } = await admin.from("espacio_secretos")
    .upsert({ espacio_id: espacioId, [campo]: valor ? cifrar(valor) : null, updated_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar (${error.message}).`);
}

export async function leerSecreto(espacioId: number, campo: Campo): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("espacio_secretos").select(campo).eq("espacio_id", espacioId).maybeSingle();
  const valor = (data as Record<string, string | null> | null)?.[campo];
  return valor ? descifrar(valor) : null;
}
