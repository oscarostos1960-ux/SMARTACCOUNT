"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { origenActual } from "@/lib/llaves";

export type EstadoRecuperar = { ok?: boolean; error?: string; correo?: string };

const COOKIE_ESPERA = "sa_recuperar";
const ESPERA = 60;   // segundos entre solicitudes desde el mismo navegador

// Envía por correo una liga de un solo uso para crear una nueva contraseña.
// Siempre responde lo mismo, exista o no el correo (para no revelar quién tiene cuenta).
export async function pedirLiga(_prev: EstadoRecuperar, formData: FormData): Promise<EstadoRecuperar> {
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "Escribe un correo válido.", correo };
  const c = await cookies();
  if (c.get(COOKIE_ESPERA)) return { ok: true, correo };
  const host = process.env.SMTP_HOST, usuario = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !usuario || !pass) return { error: "El envío de correos no está disponible. Pide al administrador una contraseña temporal.", correo };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "No disponible por ahora. Pide al administrador una contraseña temporal.", correo }; }
  c.set(COOKIE_ESPERA, "1", { httpOnly: true, sameSite: "strict", path: "/", maxAge: ESPERA });

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: correo });
  const token = data?.properties?.hashed_token;
  if (error || !token) return { ok: true, correo };   // correo inexistente: misma respuesta
  const { origen } = await origenActual();
  const liga = `${origen}/login/recuperar/confirmar?t=${encodeURIComponent(token)}`;
  const puerto = Number(process.env.SMTP_PORT || 465);
  try {
    await nodemailer.createTransport({ host, port: puerto, secure: puerto === 465, auth: { user: usuario, pass } }).sendMail({
      from: `"Smart Account" <${usuario}>`,
      to: correo,
      subject: "Smart Account · Crear nueva contraseña",
      text: `Recibimos una solicitud para crear una nueva contraseña de Smart Account.\n\nAbre esta liga (sirve una sola vez y vence en 1 hora):\n${liga}\n\nSi no fuiste tú, ignora este correo; tu contraseña no cambia.`,
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;max-width:520px">
<p>Recibimos una solicitud para crear una nueva contraseña de <b>Smart Account</b>.</p>
<p><a href="${liga}" style="display:inline-block;background:#1f3864;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Crear nueva contraseña</a></p>
<p style="font-size:13px;color:#6b7280">La liga sirve una sola vez y vence en 1 hora. Si no fuiste tú, ignora este correo; tu contraseña no cambia.</p></div>`,
    });
  } catch {
    c.delete(COOKIE_ESPERA);
    return { error: "No se pudo enviar el correo. Inténtalo en unos minutos.", correo };
  }
  return { ok: true, correo };
}

// Se canjea con un botón (no al abrir la liga) para que los revisores de correo no la gasten.
export async function canjearLiga(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  if (!token) redirect("/login/recuperar?e=1");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
  if (error) redirect("/login/recuperar?e=1");
  await supabase.auth.updateUser({ data: { debe_cambiar: true } });   // obliga a crear la nueva contraseña
  redirect("/cambiar-contrasena");
}
