"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Mail, Send, Sparkles, Trash2 } from "lucide-react";
import type { Espacio } from "@/lib/auth";
import { PROVEEDORES_CORREO } from "@/lib/correo-proveedores";
import { guardarClaveIA, guardarCorreo, guardarDatos, probarCorreo, quitarClaveIA, quitarCorreo, type Resultado } from "./actions";

// Ligas de Anthropic (la empresa de la IA). Se repiten aquí porque este archivo corre en el navegador.
const ANTHROPIC = {
  registro: "https://platform.claude.com/",
  saldo: "https://platform.claude.com/settings/billing",
  claves: "https://platform.claude.com/settings/keys",
};

function Aviso({ r }: { r: Resultado }) {
  if (!r.ok && !r.error) return null;
  return <p role="status" data-resultado className={`select-text rounded-lg px-3 py-2 text-sm ${r.error ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>{r.error ?? r.ok}</p>;
}

export default function MiEspacioVista({ espacio, correoTitular, correoGeneral }: { espacio: Espacio; correoTitular: string | null; correoGeneral: boolean }) {
  const [datos, enviarDatos, guardandoDatos] = useActionState<Resultado, FormData>(guardarDatos, {});
  return (
    <div className="space-y-8">
      <section className="card p-6" aria-labelledby="datos">
        <h2 id="datos" className="font-semibold">Datos del espacio</h2>
        <form action={enviarDatos} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="esp-nombre" className="label">Nombre del espacio</label>
            <input id="esp-nombre" name="nombre" defaultValue={espacio.nombre} required className="input" />
          </div>
          <div>
            <label htmlFor="esp-firma" className="label">Nombre con el que firmas tus avisos</label>
            <input id="esp-firma" name="correo_nombre" defaultValue={espacio.correo_nombre ?? ""} className="input" placeholder={espacio.nombre} />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn-primary" disabled={guardandoDatos}>{guardandoDatos ? "Guardando…" : "Guardar"}</button>
            <Aviso r={datos} />
          </div>
        </form>
      </section>

      {!espacio.principal && <SeccionIA espacio={espacio} />}
      <SeccionCorreo espacio={espacio} correoTitular={correoTitular} correoGeneral={correoGeneral} />
    </div>
  );
}

function SeccionIA({ espacio }: { espacio: Espacio }) {
  const [estado, guardar, guardando] = useActionState<Resultado, FormData>(guardarClaveIA, {});
  const [mensaje, setMensaje] = useState<Resultado>({});
  const [pendiente, startTransition] = useTransition();
  const lista = !!espacio.ia_clave_fin;
  return (
    <section id="ia" className="card scroll-mt-6 p-6" aria-labelledby="titulo-ia" data-seccion-ia>
      <h2 id="titulo-ia" className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-accent-strong" aria-hidden /> Crédito de IA para leer estados de cuenta</h2>
      <p className="mt-1 text-sm text-muted">
        La lectura de estados de cuenta la hace la IA de <strong>Anthropic</strong>. Usas tu propia cuenta: Anthropic te cobra
        directamente lo que consumas (con tarjeta, en dólares; normalmente unos centavos por estado de cuenta).
      </p>

      {lista ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok" data-ia-lista>
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <span className="flex-1">Clave guardada (termina en <strong className="num">{espacio.ia_clave_fin}</strong>). Ya puedes importar estados de cuenta.</span>
          <a href={ANTHROPIC.saldo} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm" data-recargar-ia>
            Ver saldo y recargar <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
          <button type="button" className="btn-ghost px-2 text-danger" disabled={pendiente} data-quitar-ia
            onClick={() => { if (confirm("¿Quitar tu clave de IA? Ya no podrás leer estados de cuenta hasta que pongas otra.")) startTransition(async () => setMensaje(await quitarClaveIA())); }}>
            <Trash2 className="h-4 w-4" aria-hidden /> Quitar
          </button>
        </div>
      ) : (
        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex gap-3"><span className="badge h-6 w-6 shrink-0 justify-center rounded-full bg-accent-soft text-accent-strong">1</span>
            <span>Crea tu cuenta en Anthropic (con tu correo). <a href={ANTHROPIC.registro} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">Abrir Anthropic <ExternalLink className="inline h-3.5 w-3.5" aria-hidden /></a></span></li>
          <li className="flex gap-3"><span className="badge h-6 w-6 shrink-0 justify-center rounded-full bg-accent-soft text-accent-strong">2</span>
            <span>Carga crédito con tu tarjeta (por ejemplo $5 USD; alcanza para muchos estados de cuenta). <a href={ANTHROPIC.saldo} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline" data-contratar-ia>Contratar crédito <ExternalLink className="inline h-3.5 w-3.5" aria-hidden /></a></span></li>
          <li className="flex gap-3"><span className="badge h-6 w-6 shrink-0 justify-center rounded-full bg-accent-soft text-accent-strong">3</span>
            <span>Crea una clave (“Create Key”), cópiala y pégala aquí abajo. <a href={ANTHROPIC.claves} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">Crear mi clave <ExternalLink className="inline h-3.5 w-3.5" aria-hidden /></a></span></li>
        </ol>
      )}

      <form action={guardar} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="ia-clave" className="label">{lista ? "Cambiar por otra clave" : "Tu clave de Anthropic"}</label>
          <input id="ia-clave" name="clave" type="password" autoComplete="off" required className="input" placeholder="sk-ant-…" />
        </div>
        <button className="btn-primary" disabled={guardando} data-guardar-ia><KeyRound className="h-4 w-4" aria-hidden /> {guardando ? "Comprobando…" : "Guardar clave"}</button>
      </form>
      <p className="mt-2 text-xs text-muted">Se guarda cifrada. Nadie puede verla completa, ni el administrador de Smart Account.</p>
      <div className="mt-3 space-y-2"><Aviso r={estado} /><Aviso r={mensaje} /></div>
    </section>
  );
}

function SeccionCorreo({ espacio, correoTitular, correoGeneral }: { espacio: Espacio; correoTitular: string | null; correoGeneral: boolean }) {
  const [estado, guardar, guardando] = useActionState<Resultado, FormData>(guardarCorreo, {});
  const [mensaje, setMensaje] = useState<Resultado>({});
  const [pendiente, startTransition] = useTransition();
  const inicial = Object.entries(PROVEEDORES_CORREO).find(([, p]) => p.host === espacio.smtp_host)?.[0] ?? (espacio.smtp_host ? "otro" : "gmail");
  const [proveedor, setProveedor] = useState(inicial);
  const p = PROVEEDORES_CORREO[proveedor];
  // Campos controlados: si la comprobación falla, lo escrito no se borra
  const [campos, setCampos] = useState({
    correo: espacio.correo_remitente ?? correoTitular ?? "",
    firma: espacio.correo_nombre ?? espacio.nombre,
    host: espacio.smtp_host ?? "",
    puerto: String(espacio.smtp_puerto ?? 465),
  });
  const cambiar = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) => setCampos({ ...campos, [k]: e.target.value });

  return (
    <section id="correo" className="card scroll-mt-6 p-6" aria-labelledby="titulo-correo" data-seccion-correo>
      <h2 id="titulo-correo" className="flex items-center gap-2 font-semibold"><Mail className="h-5 w-5 text-accent-strong" aria-hidden /> Correo para los avisos de pago</h2>
      {espacio.smtp_activo ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok" data-correo-propio>
          <CheckCircle2 className="h-5 w-5" aria-hidden /> Tus avisos salen desde <strong>{espacio.correo_remitente}</strong> a nombre de <strong>{espacio.correo_nombre || espacio.nombre}</strong>.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted" data-correo-general>
          {correoGeneral
            ? <>Por ahora tus avisos salen del correo general de Smart Account{espacio.principal ? "" : <> con tu nombre, y si el proveedor contesta, la respuesta te llega a <strong>{correoTitular}</strong></>}. Si prefieres que salgan desde tu propio correo, configúralo aquí.</>
            : "Configura tu correo para poder enviar los avisos de pago por correo."}
        </p>
      )}

      <form action={guardar} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="co-prov" className="label">Tu correo es de</label>
          <input type="hidden" name="proveedor" value={proveedor} />
          <select id="co-prov" className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            {Object.entries(PROVEEDORES_CORREO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            <option value="otro">Otro (correo de empresa)</option>
          </select>
        </div>
        <div>
          <label htmlFor="co-correo" className="label">Tu correo</label>
          <input id="co-correo" name="correo" type="email" required className="input" value={campos.correo} onChange={cambiar("correo")} />
        </div>
        <div>
          <label htmlFor="co-firma" className="label">Nombre que verá el proveedor</label>
          <input id="co-firma" name="correo_nombre" className="input" value={campos.firma} onChange={cambiar("firma")} />
        </div>
        <div>
          <label htmlFor="co-pass" className="label">Contraseña de aplicación</label>
          <input id="co-pass" name="contrasena" type="password" autoComplete="off" required className="input" placeholder={espacio.smtp_activo ? "Escríbela de nuevo para cambiar algo" : "16 letras que te da tu correo"} />
        </div>
        {proveedor === "otro" && (
          <>
            <div>
              <label htmlFor="co-host" className="label">Servidor de salida (SMTP)</label>
              <input id="co-host" name="host" className="input" required value={campos.host} onChange={cambiar("host")} placeholder="smtp.miempresa.com" />
            </div>
            <div>
              <label htmlFor="co-puerto" className="label">Puerto</label>
              <input id="co-puerto" name="puerto" type="number" className="input" required value={campos.puerto} onChange={cambiar("puerto")} />
            </div>
          </>
        )}
        <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted sm:col-span-2">
          <strong className="text-text">¿Qué es la contraseña de aplicación?</strong> Es una contraseña especial que tu correo genera para que otra
          aplicación pueda enviar correos por ti, sin usar tu contraseña normal. Necesitas tener activa la verificación en dos pasos.
          {p && <> <a href={p.ayuda} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline" data-ayuda-correo>Generarla en {p.nombre} <ExternalLink className="inline h-3 w-3" aria-hidden /></a></>}
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn-primary" disabled={guardando} data-guardar-correo>{guardando ? "Comprobando…" : "Guardar y comprobar"}</button>
          <button type="button" className="btn-secondary" disabled={pendiente} data-probar-correo onClick={() => startTransition(async () => setMensaje(await probarCorreo()))}>
            <Send className="h-4 w-4" aria-hidden /> Enviarme un correo de prueba
          </button>
          {espacio.smtp_activo && (
            <button type="button" className="btn-ghost text-danger" disabled={pendiente} data-quitar-correo
              onClick={() => { if (confirm("¿Dejar de usar tu correo? Los avisos saldrán del correo general.")) startTransition(async () => setMensaje(await quitarCorreo())); }}>
              Dejar de usar mi correo
            </button>
          )}
        </div>
      </form>
      <div className="mt-3 space-y-2"><Aviso r={estado} /><Aviso r={mensaje} /></div>
    </section>
  );
}
