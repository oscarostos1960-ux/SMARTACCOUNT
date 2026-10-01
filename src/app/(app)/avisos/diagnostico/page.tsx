import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/auth";
import FormPrueba from "./FormPrueba";

export const metadata: Metadata = { title: "Diagnóstico de WhatsApp" };
export const dynamic = "force-dynamic";

// Consulta 1msg.io desde el servidor (el token nunca se muestra).
async function consultarJson(ruta: string): Promise<{ status: number; json: unknown; texto: string }> {
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const url = `${process.env.WHATSAPP_API_URL || "https://api.1msg.io"}/${process.env.WHATSAPP_INSTANCIA}/${ruta}${ruta.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const texto = (await r.text()).split(token).join("***");
    let json: unknown = null;
    try { json = JSON.parse(texto); } catch { /* no JSON */ }
    return { status: r.status, json, texto };
  } catch (e) {
    return { status: 0, json: null, texto: `Sin respuesta: ${e instanceof Error ? e.message : "error"}` };
  }
}

type Componente = { type?: string; format?: string; text?: string };
type Plantilla = { name?: string; status?: string; language?: string; category?: string; components?: Componente[] };

// Resumen legible: nombre, estado, idioma, encabezado y texto
async function resumenPlantillas() {
  const r = await consultarJson("templates");
  const lista = (Array.isArray(r.json) ? r.json : (r.json as { templates?: unknown[] } | null)?.templates) as Plantilla[] | undefined;
  if (!lista) return `HTTP ${r.status}\n${r.texto.slice(0, 3000)}`;
  const nuestras = ["confirmacionpagosacc", "adjuntopagoacc"];
  return lista
    .sort((a, b) => Number(nuestras.includes(b.name ?? "")) - Number(nuestras.includes(a.name ?? "")))
    .map((t) => {
      const enc = t.components?.find((c) => c.type === "HEADER");
      const cuerpo = t.components?.find((c) => c.type === "BODY");
      return `${nuestras.includes(t.name ?? "") ? "★ " : "  "}${t.name} · ${t.status} · idioma ${t.language} · ${t.category ?? ""}` +
        `\n    encabezado: ${enc?.format ?? "—"} · texto: ${(cuerpo?.text ?? "").replace(/\n/g, " ").slice(0, 120)}`;
    }).join("\n");
}

// Últimos mensajes: hora, destino, tipo, estado
async function resumenMensajes() {
  const r = await consultarJson("messages?limit=30&last=true");
  const lista = (Array.isArray(r.json) ? r.json : (r.json as { messages?: unknown[] } | null)?.messages) as Record<string, unknown>[] | undefined;
  if (!lista) return `HTTP ${r.status}\n${r.texto.slice(0, 3000)}`;
  if (!lista.length) return "Sin mensajes.";
  return lista.slice(-30).reverse().map((m) => {
    const hora = typeof m.time === "number" ? new Date(m.time * 1000).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : String(m.time ?? "");
    const estado = [m.status, m.ack, m.error, m.errors].filter((x) => x != null && x !== "").map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    return `${hora} · ${m.fromMe ? "enviado a" : "recibido de"} ${m.chatId ?? m.chat_id ?? ""} · ${m.type ?? ""} ${estado ? `· ${estado}` : ""}\n    ${String(m.body ?? m.caption ?? "").replace(/\s+/g, " ").slice(0, 140)}`;
  }).join("\n");
}

async function consultar(ruta: string) {
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const url = `${process.env.WHATSAPP_API_URL || "https://api.1msg.io"}/${process.env.WHATSAPP_INSTANCIA}/${ruta}${ruta.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const texto = (await r.text()).split(token).join("***");
    try { return `HTTP ${r.status}\n${JSON.stringify(JSON.parse(texto), null, 2)}`.slice(0, 12000); }
    catch { return `HTTP ${r.status}\n${texto}`.slice(0, 4000); }
  } catch (e) {
    return `Sin respuesta: ${e instanceof Error ? e.message : "error"}`;
  }
}

export default async function DiagnosticoPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") notFound();
  const [status, me, templates, messages] = await Promise.all([
    consultar("status"), consultar("me"), resumenPlantillas(), resumenMensajes(),
  ]);
  const bloques = [
    { titulo: "Estado de la instancia (/status)", texto: status },
    { titulo: "Cuenta (/me)", texto: me },
    { titulo: "Plantillas (/templates)", texto: templates },
    { titulo: "Últimos mensajes (/messages)", texto: messages },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Diagnóstico de WhatsApp</h1>
        <p className="mt-1 text-sm text-muted">Respuestas de 1msg.io para revisar por qué un aviso no llega. El token no se muestra.</p>
      </header>
      <FormPrueba />
      {bloques.map((b) => (
        <section key={b.titulo} className="card p-4">
          <h2 className="mb-2 font-semibold">{b.titulo}</h2>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs">{b.texto}</pre>
        </section>
      ))}
    </div>
  );
}
