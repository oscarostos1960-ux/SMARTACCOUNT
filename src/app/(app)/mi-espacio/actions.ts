"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular, obtenerEspacio } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarSecreto } from "@/lib/secretos";
import { salidaCorreo, transporteCorreo } from "@/lib/avisos";
import { PROVEEDORES_CORREO } from "@/lib/correo-proveedores";

export type Resultado = { ok?: string; error?: string };

async function espacioDelTitular() {
  await exigirTitular();
  return obtenerEspacio();
}

function admin() {
  return createAdminClient();
}

const limpio = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max);

export async function guardarDatos(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const espacio = await espacioDelTitular();
  const nombre = limpio(formData.get("nombre"));
  const firma = limpio(formData.get("correo_nombre"));
  if (!nombre) return { error: "Escribe el nombre de tu espacio." };
  const { error } = await admin().from("espacios").update({ nombre, correo_nombre: firma || null }).eq("id", espacio.id);
  if (error) return { error: `No se pudo guardar (${error.message}).` };
  revalidatePath("/mi-espacio");
  return { ok: "Datos guardados." };
}

// ---------- Clave de IA (Anthropic) ----------
export async function guardarClaveIA(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const espacio = await espacioDelTitular();
  if (espacio.principal) return { error: "Tu espacio usa el crédito de IA de Vercel; no necesitas clave propia." };
  const clave = String(formData.get("clave") ?? "").replace(/\s+/g, "");
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(clave)) return { error: "Esa no parece una clave de Anthropic: empieza con sk-ant- y es larga. Cópiala completa." };

  // Se comprueba con Anthropic antes de guardarla (consultar modelos no cuesta)
  try {
    const r = await fetch(`${process.env.ANTHROPIC_API_URL || "https://api.anthropic.com"}/v1/models?limit=1`, {
      headers: { "x-api-key": clave, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15000),
    });
    if (r.status === 401 || r.status === 403) return { error: "Anthropic rechazó la clave. Revisa que la copiaste completa y que no la hayas borrado." };
    if (!r.ok) return { error: `No se pudo comprobar la clave (Anthropic respondió ${r.status}). Intenta de nuevo en un momento.` };
  } catch {
    return { error: "No se pudo comunicar con Anthropic para comprobar la clave. Intenta de nuevo." };
  }
  try {
    await guardarSecreto(espacio.id, "ia_clave", clave);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la clave." };
  }
  await admin().from("espacios").update({ ia_clave_fin: clave.slice(-4) }).eq("id", espacio.id);
  revalidatePath("/mi-espacio");
  revalidatePath("/importar");
  return { ok: "Clave guardada y comprobada. Ya puedes leer estados de cuenta con IA." };
}

export async function quitarClaveIA(): Promise<Resultado> {
  const espacio = await espacioDelTitular();
  if (espacio.principal) return {};
  await guardarSecreto(espacio.id, "ia_clave", null);
  await admin().from("espacios").update({ ia_clave_fin: null }).eq("id", espacio.id);
  revalidatePath("/mi-espacio");
  return { ok: "Se quitó la clave de IA." };
}

// ---------- Correo propio para los avisos ----------
export async function guardarCorreo(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const espacio = await espacioDelTitular();
  const proveedor = String(formData.get("proveedor") ?? "gmail");
  const correo = limpio(formData.get("correo"), 200).toLowerCase();
  const firma = limpio(formData.get("correo_nombre"));
  const contrasena = String(formData.get("contrasena") ?? "").replace(/\s+/g, "");
  const conocido = PROVEEDORES_CORREO[proveedor];
  const host = conocido?.host ?? limpio(formData.get("host"), 200);
  const puerto = conocido?.puerto ?? Number(formData.get("puerto") || 465);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Escribe un correo válido." };
  if (!contrasena) return { error: "Escribe la contraseña de aplicación de tu correo." };
  if (!host || !Number.isInteger(puerto) || puerto < 1 || puerto > 65535) return { error: "Escribe el servidor y el puerto de tu correo." };

  // Se prueba la conexión antes de guardar
  try {
    await transporteCorreo({ host, puerto, usuario: correo, contrasena, from: correo }).verify();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/auth|535|534|credentials|password|username/i.test(msg)) {
      return { error: "Tu correo rechazó el usuario o la contraseña. Usa una contraseña de aplicación (no tu contraseña normal) y revisa que la verificación en dos pasos esté activa." };
    }
    return { error: `No se pudo conectar con tu correo (${msg.slice(0, 160) || "sin respuesta"}).` };
  }
  try {
    await guardarSecreto(espacio.id, "smtp_contrasena", contrasena);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
  const { error } = await admin().from("espacios").update({
    correo_remitente: correo, correo_nombre: firma || null, smtp_host: host, smtp_puerto: puerto, smtp_activo: true,
  }).eq("id", espacio.id);
  if (error) return { error: `No se pudo guardar (${error.message}).` };
  revalidatePath("/mi-espacio");
  return { ok: "Listo: tus avisos de pago saldrán desde tu correo. Envía un correo de prueba para confirmarlo." };
}

export async function quitarCorreo(): Promise<Resultado> {
  const espacio = await espacioDelTitular();
  await guardarSecreto(espacio.id, "smtp_contrasena", null);
  await admin().from("espacios").update({ smtp_activo: false, smtp_host: null, smtp_puerto: null }).eq("id", espacio.id);
  revalidatePath("/mi-espacio");
  return { ok: "Tus avisos volverán a salir del correo general de Smart Account." };
}

export async function probarCorreo(): Promise<Resultado> {
  const perfil = await exigirTitular();
  const e = await obtenerEspacio();
  const destino = perfil.correo;
  if (!destino) return { error: "Tu usuario no tiene correo registrado." };
  const salida = await salidaCorreo({
    id: e.id, nombre: e.nombre, principal: e.principal, titularCorreo: perfil.correo,
    correoRemitente: e.correo_remitente, correoNombre: e.correo_nombre, smtpHost: e.smtp_host, smtpPuerto: e.smtp_puerto, smtpActivo: e.smtp_activo,
  });
  if (!salida) return { error: "No hay correo de salida configurado." };
  try {
    await transporteCorreo(salida).sendMail({
      from: salida.from, replyTo: salida.replyTo, to: destino,
      subject: "Prueba de correo · Smart Account",
      text: "Este es un correo de prueba. Así les llegarán a tus proveedores los avisos de pago.",
    });
  } catch (err) {
    return { error: `No se pudo enviar (${err instanceof Error ? err.message.slice(0, 160) : "error"}).` };
  }
  return { ok: `Correo de prueba enviado a ${destino}${e.smtp_activo ? ` desde ${e.correo_remitente}` : " desde el correo general"}. Revisa tu bandeja.` };
}
