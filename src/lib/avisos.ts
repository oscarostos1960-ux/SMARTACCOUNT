import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero, fecha } from "@/lib/formato";

// Avisos de pago al proveedor: imagen con los datos del pago + comprobante,
// por WhatsApp (plantillas aprobadas de 1msg.io) y por correo (SMTP).

export type Canal = "whatsapp" | "correo";
export type ResultadoAviso = { canal: Canal; ok: boolean; destino: string | null; mensaje: string };

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
};

const CADUCIDAD_LIGAS = 60 * 60 * 24 * 7;   // 7 días: tiempo para que WhatsApp descargue los archivos

export function whatsappConfigurado() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_INSTANCIA);
}
export function correoConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Celular de México en el formato que usaba el sistema anterior: 521 + 10 dígitos
export function telefonoWhatsApp(celular: string | null) {
  const d = (celular ?? "").replace(/\D/g, "");
  if (d.length === 10) return `521${d}`;
  if (d.length === 12 && d.startsWith("52")) return `521${d.slice(2)}`;
  if (d.length === 13 && d.startsWith("521")) return d;
  return null;
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
  };
}

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
async function plantilla(telefono: string, nombre: string, encabezado: Record<string, unknown>, template: string) {
  const base = process.env.WHATSAPP_API_URL || "https://api.1msg.io";
  const url = `${base}/${process.env.WHATSAPP_INSTANCIA}/sendTemplate?token=${encodeURIComponent(process.env.WHATSAPP_TOKEN ?? "")}`;
  const cuerpo = {
    phone: telefono,
    template,
    namespace: process.env.WHATSAPP_NAMESPACE || "f8e2e036_389c_4874_96a1_4d7ebd27f86e",
    language: { code: "es_mx", policy: "deterministic" },
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
  return { ok, detalle: (typeof json.error === "string" ? json.error : typeof json.message === "string" ? json.message : texto).slice(0, 300) || `HTTP ${r.status}` };
}

async function enviarWhatsApp(supabase: SupabaseClient, d: DatosAviso, imagenUrl: string): Promise<ResultadoAviso> {
  const telefono = telefonoWhatsApp(d.celular);
  if (!whatsappConfigurado()) return { canal: "whatsapp", ok: false, destino: null, mensaje: "WhatsApp no está configurado." };
  if (!telefono) return { canal: "whatsapp", ok: false, destino: d.celular, mensaje: "El proveedor no tiene un celular de 10 dígitos." };
  const imagen = await plantilla(telefono, d.proveedor, { type: "image", image: { link: imagenUrl } }, "confirmacionpagosacc");
  if (!imagen.ok) return { canal: "whatsapp", ok: false, destino: telefono, mensaje: `WhatsApp rechazó el aviso: ${imagen.detalle}` };
  let enviados = 0;
  const fallas: string[] = [];
  for (const doc of d.documentos.slice(0, 5)) {
    const { data } = await supabase.storage.from("documentos").createSignedUrl(doc.ruta, CADUCIDAD_LIGAS);
    if (!data) { fallas.push(doc.nombre); continue; }
    const r = await plantilla(telefono, d.proveedor, { type: "document", document: { link: data.signedUrl, filename: doc.nombre } }, "adjuntopagoacc");
    if (r.ok) enviados++; else fallas.push(`${doc.nombre} (${r.detalle})`);
  }
  const extra = d.documentos.length ? ` y ${enviados} de ${Math.min(d.documentos.length, 5)} comprobante(s)` : " (sin comprobante adjunto)";
  return {
    canal: "whatsapp", ok: fallas.length === 0, destino: telefono,
    mensaje: `Aviso enviado${extra}.${fallas.length ? ` No se pudieron enviar: ${fallas.join(", ")}.` : ""}`,
  };
}

// ---------- Correo (SMTP) ----------
async function enviarCorreo(supabase: SupabaseClient, d: DatosAviso, png: Buffer): Promise<ResultadoAviso> {
  if (!correoConfigurado()) return { canal: "correo", ok: false, destino: null, mensaje: "El correo de salida no está configurado." };
  if (!correoValido(d.correo)) return { canal: "correo", ok: false, destino: d.correo, mensaje: "El proveedor no tiene un correo válido." };
  const adjuntos: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const doc of d.documentos.slice(0, 10)) {
    const { data } = await supabase.storage.from("documentos").download(doc.ruta);
    if (data) adjuntos.push({ filename: doc.nombre, content: Buffer.from(await data.arrayBuffer()), contentType: doc.tipo ?? undefined });
  }
  const puerto = Number(process.env.SMTP_PORT || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const remitente = process.env.CORREO_REMITENTE || process.env.SMTP_USER!;
  await transporte.sendMail({
    from: remitente,
    to: d.correo!,
    cc: process.env.AVISO_COPIA || undefined,
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
    transaccion_id: movimientoId, canal: r.canal, destino: r.destino, estado: r.ok ? "enviado" : "error", detalle: r.mensaje,
  })));
  const cambios: Record<string, string> = {};
  for (const r of resultados) cambios[r.canal === "whatsapp" ? "aviso_whatsapp" : "aviso_correo"] = r.ok ? "enviado" : "pendiente";
  await supabase.from("transacciones").update(cambios).eq("id", movimientoId);
  return resultados;
}
