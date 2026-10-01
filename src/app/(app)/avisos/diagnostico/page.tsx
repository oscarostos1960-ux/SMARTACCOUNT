import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/auth";
import FormPrueba from "./FormPrueba";

export const metadata: Metadata = { title: "Diagnóstico de WhatsApp" };
export const dynamic = "force-dynamic";

// Consulta 1msg.io desde el servidor (el token nunca se muestra).
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
    consultar("status"), consultar("me"), consultar("templates"), consultar("messages?limit=20&last=true"),
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
