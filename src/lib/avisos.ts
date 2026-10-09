import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero, fecha } from "@/lib/formato";
import { leerSecreto } from "@/lib/secretos";

// Avisos de pago al proveedor: imagen con los datos del pago + comprobante,
// por WhatsApp (plantillas aprobadas de 1msg.io) y por correo (SMTP).

export type Canal = "whatsapp" | "correo";
export type ResultadoAviso = { canal: Canal; ok: boolean; destino: string | null; mensaje: string; tecnico?: string; espera?: boolean };
const COLUMNA: Record<Canal, "aviso_whatsapp" | "aviso_correo"> = { whatsapp: "aviso_whatsapp", correo: "aviso_correo" };
export const MENSAJE_ESPERA = "En espera: se enviará solo en cuanto adjuntes el comprobante de pago.";

type DatosAviso = {
  id: number;
  cuentaId: number;
  proveedor: string;
  celular: string | null;
  correo: string | null;
  fecha: string;
  concepto: string;
  importe: number;
  moneda: string;
  documentos: { nombre: string; ruta: string; tipo: string | null }[];
  espacio: EspacioAviso;
};

// Quién firma y desde qué correo sale el aviso (cada cliente con espacio propio usa su nombre y su correo)
export type EspacioAviso = {
  id: number; nombre: string; principal: boolean; titularCorreo: string | null;
  correoRemitente: string | null; correoNombre: string | null; smtpHost: string | null; smtpPuerto: number | null; smtpActivo: boolean;
};

const CADUCIDAD_LIGAS = 60 * 60 * 24 * 7;   // 7 días: tiempo para que WhatsApp descargue los archivos

// Plantillas aprobadas por Meta (se pueden cambiar en Vercel sin tocar el código)
export const PLANTILLA_IMAGEN = () => process.env.WHATSAPP_PLANTILLA_IMAGEN || "confirmacionpagosacc";
export const PLANTILLA_DOCUMENTO = () => process.env.WHATSAPP_PLANTILLA_DOCUMENTO || "adjuntopagoacc";

export function whatsappConfigurado() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_INSTANCIA);
}
export function correoConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Celular de México: 521 + 10 dígitos (así entrega esta instancia de 1msg; WHATSAPP_FORMATO=52 para cambiarlo).
export function telefonoWhatsApp(celular: string | null, formato = process.env.WHATSAPP_FORMATO === "52" ? "52" : "521") {
  const d = (celular ?? "").replace(/\D/g, "");
  let diez: string | null = null;
  if (d.length === 10) diez = d;
  else if (d.length === 12 && d.startsWith("52")) diez = d.slice(2);
  else if (d.length === 13 && d.startsWith("521")) diez = d.slice(3);
  return diez ? `${formato}${diez}` : null;
}
const correoValido = (c: string | null) => !!c && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(c.trim());

async function cargarDatos(supabase: SupabaseClient, movimientoId: number): Promise<DatosAviso | null> {
  const { data: t } = await supabase.from("transacciones")
    .select("id, cuenta_id, fecha, cargo, abono, descripcion, proveedor_id, concepto_id")
    .eq("id", movimientoId).maybeSingle();
  if (!t) return null;
  const [provR, conR, cuentaR, docsR] = await Promise.all([
    t.proveedor_id
      ? supabase.from("proveedores").select("nombre, apellido_paterno, apellido_materno, razon_social, celular, correo").eq("id", t.proveedor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    t.concepto_id ? supabase.from("conceptos").select("nombre").eq("id", t.concepto_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("v_saldos_cuentas").select("moneda").eq("cuenta_id", t.cuenta_id).maybeSingle(),
    supabase.from("documentos").select("nombre, ruta, tipo").eq("transaccion_id", movimientoId).order("id"),
  ]);
  const espacio = await cargarEspacio(supabase, Number(t.cuenta_id));
  type Prov = { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; razon_social: string | null; celular: string | null; correo: string | null };
  const p = provR.data as Prov | null;
  return {
    id: Number(t.id),
    cuentaId: Number(t.cuenta_id),
    proveedor: p ? (p.razon_social || [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(" ")) : "",
    celular: p?.celular ?? null,
    correo: p?.correo?.trim() ?? null,
    fecha: String(t.fecha),
    concepto: (conR.data as { nombre: string } | null)?.nombre ?? String(t.descripcion ?? ""),
    importe: Number(t.cargo) > 0 ? Number(t.cargo) : Number(t.abono),
    moneda: (cuentaR.data as { moneda: string } | null)?.moneda ?? "MXN",
    documentos: (docsR.data ?? []) as DatosAviso["documentos"],
    espacio,
  };
}

async function cargarEspacio(supabase: SupabaseClient, cuentaId: number): Promise<EspacioAviso> {
  const { data: c } = await supabase.from("cuentas").select("espacio_id").eq("id", cuentaId).maybeSingle();
  const { data: e } = c ? await supabase.from("espacios")
    .select("id, nombre, principal, titular_id, correo_remitente, correo_nombre, smtp_host, smtp_puerto, smtp_activo")
    .eq("id", c.espacio_id).maybeSingle() : { data: null };
  if (!e) return { id: 0, nombre: "", principal: true, titularCorreo: null, correoRemitente: null, correoNombre: null, smtpHost: null, smtpPuerto: null, smtpActivo: false };
  const { data: tit } = e.titular_id ? await supabase.from("perfiles").select("correo").eq("id", e.titular_id).maybeSingle() : { data: null };
  return {
    id: Number(e.id), nombre: String(e.nombre ?? ""), principal: !!e.principal, titularCorreo: (tit?.correo as string | null) ?? null,
    correoRemitente: e.correo_remitente, correoNombre: e.correo_nombre, smtpHost: e.smtp_host, smtpPuerto: e.smtp_puerto, smtpActivo: !!e.smtp_activo,
  };
}

// Nombre con el que firma el aviso: en el espacio principal la imagen ya trae la firma de Oscar
const firma = (e: EspacioAviso) => (e.principal ? null : (e.correoNombre || e.nombre || "").trim() || null);

// ---------- Imagen del aviso (misma presentación que el sistema anterior) ----------
async function generarImagen(d: DatosAviso): Promise<Buffer> {
  const dir = join(process.cwd(), "src/assets");
  const [fondo, negrita] = await Promise.all([readFile(join(dir, "aviso-fondo.jpg")), readFile(join(dir, "Geist-Bold.ttf"))]);
  const naranja = "#F27316";
  const texto = (contenido: string, left: number, top: number, max: number, base = 34) => {
    const size = Math.max(18, Math.min(base, Math.floor((max / Math.max(contenido.length, 1)) * 1.9)));
    return h("div", { style: { position: "absolute", left, top: top - size, width: max, fontSize: size, color: naranja, display: "flex", lineHeight: 1.15 } }, contenido);
  };
  const res = new ImageResponse(
    h("div", { style: { width: 1000, height: 1476, display: "flex", position: "relative", fontFamily: "Geist" } },
      h("img", { src: `data:image/jpeg;base64,${fondo.toString("base64")}`, width: 1000, height: 1476, style: { position: "absolute", left: 0, top: 0 } }),
      texto(d.proveedor.toUpperCase(), 154, 210, 640),
      texto(fecha(d.fecha), 438, 448, 420),
      texto(d.concepto.toUpperCase(), 285, 512, 600),
      texto(dinero(d.importe, d.moneda) + (d.moneda !== "MXN" ? ` ${d.moneda}` : ""), 423, 574, 420),
      // Clientes con espacio propio: se tapa la firma original y se pone su nombre
      ...(firma(d.espacio) ? [
        h("div", { style: { position: "absolute", left: 92, top: 862, width: 440, height: 66, display: "flex", background: "linear-gradient(180deg, #153765 0%, #183a68 100%)" } }),
        texto(firma(d.espacio)!, 104, 916, 420, 46),
      ] : []),
    ),
    { width: 1000, height: 1476, fonts: [{ name: "Geist", data: negrita.buffer.slice(negrita.byteOffset, negrita.byteOffset + negrita.byteLength) as ArrayBuffer, weight: 700, style: "normal" }] },
  );
  return Buffer.from(await res.arrayBuffer());
}

async function subirImagen(supabase: SupabaseClient, d: DatosAviso, png: Buffer) {
  const ruta = `${d.cuentaId}/${d.id}/aviso-${Date.now()}.png`;
  const { error } = await supabase.storage.from("documentos").upload(ruta, png, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`No se pudo guardar la imagen del aviso (${error.message}).`);
  const { data, error: e2 } = await supabase.storage.from("documentos").createSignedUrl(ruta, CADUCIDAD_LIGAS);
  if (e2 || !data) throw new Error("No se pudo crear la liga de la imagen del aviso.");
  return data.signedUrl;
}

// ---------- WhatsApp (1msg.io) ----------
export async function plantilla(telefono: string, nombre: string, encabezado: Record<string, unknown>, template: string) {
  const base = process.env.WHATSAPP_API_URL || "https://api.1msg.io";
  const url = `${base}/${process.env.WHATSAPP_INSTANCIA}/sendTemplate?token=${encodeURIComponent(process.env.WHATSAPP_TOKEN ?? "")}`;
  const cuerpo = {
    phone: telefono,
    template,
    namespace: process.env.WHATSAPP_NAMESPACE || "f8e2e036_389c_4874_96a1_4d7ebd27f86e",
    language: { code: process.env.WHATSAPP_IDIOMA || "es_MX", policy: "deterministic" },   // como está aprobada la plantilla
    params: [
      { type: "header", parameters: [encabezado] },
      { type: "body", parameters: [{ type: "text", text: nombre }] },
    ],
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(20000) });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  const ok = r.ok && json.sent !== false && !json.error;
  // Nunca se guarda la URL con el token: solo la respuesta del servicio
  return {
    ok,
    detalle: (typeof json.error === "string" ? json.error : typeof json.message === "string" ? json.message : texto).slice(0, 300) || `HTTP ${r.status}`,
    respuesta: `HTTP ${r.status} ${texto}`.slice(0, 500),
  };
}

async function enviarWhatsApp(supabase: SupabaseClient, d: DatosAviso, imagenUrl: string): Promise<ResultadoAviso> {
  const telefono = telefonoWhatsApp(d.celular);
  if (!whatsappConfigurado()) return { canal: "whatsapp", ok: false, destino: null, mensaje: "WhatsApp no está configurado." };
  if (!telefono) return { canal: "whatsapp", ok: false, destino: d.celular, mensaje: "El proveedor no tiene un celular de 10 dígitos." };
  const imagen = await plantilla(telefono, d.proveedor, { type: "image", image: { link: imagenUrl } }, PLANTILLA_IMAGEN());
  if (!imagen.ok) return { canal: "whatsapp", ok: false, destino: telefono, mensaje: `WhatsApp rechazó el aviso: ${imagen.detalle}`, tecnico: `imagen: ${imagen.respuesta}` };
  let enviados = 0;
  const fallas: string[] = [];
  const tecnico = [`imagen: ${imagen.respuesta}`];
  for (const doc of d.documentos.slice(0, 5)) {
    const { data } = await supabase.storage.from("documentos").createSignedUrl(doc.ruta, CADUCIDAD_LIGAS);
    if (!data) { fallas.push(doc.nombre); continue; }
    const r = await plantilla(telefono, d.proveedor, { type: "document", document: { link: data.signedUrl, filename: doc.nombre } }, PLANTILLA_DOCUMENTO());
    tecnico.push(`documento: ${r.respuesta}`);
    if (r.ok) enviados++; else fallas.push(`${doc.nombre} (${r.detalle})`);
  }
  const extra = d.documentos.length ? ` y ${enviados} de ${Math.min(d.documentos.length, 5)} comprobante(s)` : " (sin comprobante adjunto)";
  return {
    canal: "whatsapp", ok: fallas.length === 0, destino: telefono,
    mensaje: `Aviso enviado${extra}.${fallas.length ? ` No se pudieron enviar: ${fallas.join(", ")}.` : ""}`,
    tecnico: tecnico.join(" | "),
  };
}

// ---------- Correo (SMTP) ----------
// 1) El espacio configuró su propio correo → sale de ahí, con su nombre.
// 2) Espacio principal sin correo propio → correo general (variables de Vercel), como siempre.
// 3) Cliente sin correo propio → correo general, pero con su nombre y las respuestas le llegan a él (sin copia a Oscar).
type Salida = { host: string; puerto: number; usuario: string; contrasena: string; from: string; replyTo?: string; cc?: string };

export async function salidaCorreo(e: EspacioAviso): Promise<Salida | null> {
  if (e.smtpActivo && e.smtpHost && e.correoRemitente) {
    const contrasena = await leerSecreto(e.id, "smtp_contrasena").catch(() => null);
    if (contrasena) {
      return {
        host: e.smtpHost, puerto: e.smtpPuerto || 465, usuario: e.correoRemitente, contrasena,
        from: `"${(e.correoNombre || e.nombre).replace(/"/g, "")}" <${e.correoRemitente}>`,
      };
    }
  }
  if (!correoConfigurado()) return null;
  const general = { host: process.env.SMTP_HOST!, puerto: Number(process.env.SMTP_PORT || 465), usuario: process.env.SMTP_USER!, contrasena: process.env.SMTP_PASS! };
  if (e.principal) return { ...general, from: process.env.CORREO_REMITENTE || process.env.SMTP_USER!, cc: process.env.AVISO_COPIA || undefined };
  const nombre = (e.correoNombre || e.nombre || "Smart Account").replace(/"/g, "");
  return { ...general, from: `"${nombre}" <${process.env.SMTP_USER}>`, replyTo: e.correoRemitente || e.titularCorreo || undefined };
}

export function transporteCorreo(s: Salida) {
  return nodemailer.createTransport({ host: s.host, port: s.puerto, secure: s.puerto === 465, auth: { user: s.usuario, pass: s.contrasena } });
}

async function enviarCorreo(supabase: SupabaseClient, d: DatosAviso, png: Buffer): Promise<ResultadoAviso> {
  const salida = await salidaCorreo(d.espacio);
  if (!salida) return { canal: "correo", ok: false, destino: null, mensaje: "El correo de salida no está configurado." };
  if (!correoValido(d.correo)) return { canal: "correo", ok: false, destino: d.correo, mensaje: "El proveedor no tiene un correo válido." };
  const adjuntos: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const doc of d.documentos.slice(0, 10)) {
    const { data } = await supabase.storage.from("documentos").download(doc.ruta);
    if (data) adjuntos.push({ filename: doc.nombre, content: Buffer.from(await data.arrayBuffer()), contentType: doc.tipo ?? undefined });
  }
  await transporteCorreo(salida).sendMail({
    from: salida.from,
    replyTo: salida.replyTo,
    to: d.correo!,
    cc: salida.cc,
    subject: "Notificación Comprobante de Pago",
    text: `${d.proveedor}: te hago llegar el comprobante del pago realizado el ${fecha(d.fecha)} por ${dinero(d.importe, d.moneda)} (${d.concepto}). Te agradeceré confirmar de recibido.`,
    html: `<table><tr><td><img src="cid:aviso" alt="Comprobante de pago" style="width:100%;max-width:600px;height:auto"></td></tr></table>`,
    attachments: [{ filename: "aviso.png", content: png, cid: "aviso", contentType: "image/png" }, ...adjuntos],
  });
  return { canal: "correo", ok: true, destino: d.correo, mensaje: `Correo enviado${adjuntos.length ? ` con ${adjuntos.length} comprobante(s)` : " (sin comprobante adjunto)"}.` };
}

// Envía el aviso de un movimiento por los canales indicados y deja constancia.
export async function enviarAvisoMovimiento(supabase: SupabaseClient, movimientoId: number, canales: Canal[]): Promise<ResultadoAviso[]> {
  const d = await cargarDatos(supabase, movimientoId);
  if (!d) return canales.map((canal) => ({ canal, ok: false, destino: null, mensaje: "No se encontró el movimiento." }));

  // Candado: sin comprobante adjunto no sale nada; queda en espera y se envía al adjuntarlo
  if (!d.documentos.length) {
    const espera: Record<string, string> = {};
    for (const canal of canales) espera[COLUMNA[canal]] = "espera";
    await supabase.from("transacciones").update(espera).eq("id", movimientoId);
    return canales.map((canal) => ({
      canal, ok: false, espera: true, mensaje: MENSAJE_ESPERA,
      destino: canal === "correo" ? d.correo : telefonoWhatsApp(d.celular) ?? d.celular,
    }));
  }

  const resultados: ResultadoAviso[] = [];
  let png: Buffer | null = null;
  let imagenUrl: string | null = null;
  try {
    png = await generarImagen(d);
    if (canales.includes("whatsapp") && whatsappConfigurado() && telefonoWhatsApp(d.celular)) imagenUrl = await subirImagen(supabase, d, png);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo preparar la imagen del aviso.";
    return canales.map((canal) => ({ canal, ok: false, destino: null, mensaje }));
  }

  for (const canal of canales) {
    try {
      resultados.push(canal === "whatsapp"
        ? await enviarWhatsApp(supabase, d, imagenUrl ?? "")
        : await enviarCorreo(supabase, d, png));
    } catch (e) {
      resultados.push({ canal, ok: false, destino: canal === "correo" ? d.correo : d.celular, mensaje: `No se pudo enviar (${e instanceof Error ? e.message.slice(0, 200) : "error"}).` });
    }
  }

  await supabase.from("avisos").insert(resultados.map((r) => ({
    transaccion_id: movimientoId, canal: r.canal, destino: r.destino, estado: r.ok ? "enviado" : "error", detalle: r.tecnico ? `${r.mensaje} — ${r.tecnico}`.slice(0, 1500) : r.mensaje,
  })));
  const cambios: Record<string, string> = {};
  for (const r of resultados) cambios[r.canal === "whatsapp" ? "aviso_whatsapp" : "aviso_correo"] = r.ok ? "enviado" : "pendiente";
  await supabase.from("transacciones").update(cambios).eq("id", movimientoId);
  return resultados;
}
