import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clock, Download, Mail, MessageCircle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dinero, fecha } from "@/lib/formato";
import {
  aplicarFiltros, CANAL_TEXTO, consultaComprobantes, ESTADO_TEXTO, fechaHoraCDMX, leerFiltrosComprobantes,
  POR_PAGINA_COMPROBANTES, type Comprobante,
} from "@/lib/comprobantes";

export const metadata: Metadata = { title: "Comprobantes de pago enviados" };

export default async function ComprobantesPage(props: PageProps<"/reportes/comprobantes">) {
  const f = leerFiltrosComprobantes(await props.searchParams);
  const supabase = await createClient();
  const desdeFila = (f.pagina - 1) * POR_PAGINA_COMPROBANTES;

  const vista = () => supabase.from("v_comprobantes_enviados");
  const contar = (canal: string | null, estado: string) => {
    let c = aplicarFiltros(vista().select("id", { count: "exact", head: true }), f, ["canal", "estado"]).eq("estado", estado);
    if (canal) c = c.eq("canal", canal);
    return c;
  };
  const [lista, wa, co, err, esp] = await Promise.all([
    aplicarFiltros(vista().select("*", { count: "exact" }), f)
      .order("fecha_envio", { ascending: false }).order("enviado_en", { ascending: false, nullsFirst: false }).order("folio", { ascending: false })
      .range(desdeFila, desdeFila + POR_PAGINA_COMPROBANTES - 1),
    contar("whatsapp", "enviado"), contar("correo", "enviado"), contar(null, "error"), contar(null, "espera"),
  ]);
  const filas = (lista.data ?? []) as Comprobante[];
  const total = lista.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_COMPROBANTES));

  const resumen = [
    { texto: "Por WhatsApp", n: wa.count ?? 0, filtro: { canal: "whatsapp", estado: "enviado" }, icono: MessageCircle, tono: "text-ok" },
    { texto: "Por correo", n: co.count ?? 0, filtro: { canal: "correo", estado: "enviado" }, icono: Mail, tono: "text-ok" },
    { texto: "Con error", n: err.count ?? 0, filtro: { estado: "error" }, icono: AlertTriangle, tono: "text-danger" },
    { texto: "Esperan comprobante", n: esp.count ?? 0, filtro: { estado: "espera" }, icono: Clock, tono: "text-warn" },
  ];
  const base = { ...f, canal: undefined, estado: undefined };

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/reportes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-primary"><ArrowLeft className="h-4 w-4" aria-hidden /> Reportes</Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">Comprobantes de pago enviados</h1>
          <p className="mt-1 text-sm text-muted">A quién, cuándo y por qué medio se envió cada comprobante de pago.</p>
        </div>
        <a href={`/reportes/comprobantes/exportar${consultaComprobantes(f)}`} className="btn-secondary" data-exportar>
          <Download className="h-4 w-4" aria-hidden /> Descargar a Excel
        </a>
      </header>

      <form method="get" className="card mb-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-6" data-filtros>
        <div className="col-span-2 sm:col-span-2">
          <label htmlFor="c-q" className="label">Buscar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="c-q" name="q" defaultValue={f.q ?? ""} className="input pl-9" placeholder="Proveedor, celular, correo, cuenta…" />
          </div>
        </div>
        <div>
          <label htmlFor="c-desde" className="label">Desde</label>
          <input id="c-desde" name="desde" type="date" defaultValue={f.desde ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor="c-hasta" className="label">Hasta</label>
          <input id="c-hasta" name="hasta" type="date" defaultValue={f.hasta ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor="c-canal" className="label">Medio</label>
          <select id="c-canal" name="canal" defaultValue={f.canal ?? ""} className="input">
            <option value="">Todos</option><option value="whatsapp">WhatsApp</option><option value="correo">Correo</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-estado" className="label">Estado</label>
          <select id="c-estado" name="estado" defaultValue={f.estado ?? ""} className="input">
            <option value="">Todos</option><option value="enviado">Enviado</option><option value="error">Con error</option><option value="espera">En espera de comprobante</option><option value="pendiente">Pendiente</option>
          </select>
        </div>
        <div className="col-span-2 flex justify-end gap-2 sm:col-span-6">
          <Link href="/reportes/comprobantes" className="btn-ghost">Limpiar</Link>
          <button type="submit" className="btn-primary">Ver reporte</button>
        </div>
      </form>

      <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-resumen>
        {resumen.map((r) => (
          <li key={r.texto}>
            <Link href={`/reportes/comprobantes${consultaComprobantes(base, r.filtro)}`} className="card block p-3 hover:shadow-md">
              <span className="flex items-center gap-1.5 text-xs text-muted"><r.icono className={`h-3.5 w-3.5 ${r.tono}`} aria-hidden />{r.texto}</span>
              <span className="num mt-1 block text-xl font-semibold">{r.n.toLocaleString("es-MX")}</span>
            </Link>
          </li>
        ))}
      </ul>

      {lista.error ? (
        <p className="card p-6 text-sm text-danger">No se pudo generar el reporte: {lista.error.message}</p>
      ) : filas.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No hay comprobantes con estos filtros.</p>
      ) : (
        <section className="card overflow-hidden">
          <p className="border-b border-border px-4 py-2 text-xs text-muted">
            {total.toLocaleString("es-MX")} registro{total === 1 ? "" : "s"}
            {paginas > 1 && <> · página {f.pagina} de {paginas}</>}
          </p>
          <ul className="divide-y divide-border" data-lista-comprobantes>
            {filas.map((r) => <Fila key={r.id} r={r} />)}
          </ul>
        </section>
      )}

      {paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          {f.pagina > 1 ? <Link className="btn-secondary" href={`/reportes/comprobantes${consultaComprobantes(f, { pagina: f.pagina - 1 })}`}>Anterior</Link> : <span />}
          {f.pagina < paginas ? <Link className="btn-secondary" href={`/reportes/comprobantes${consultaComprobantes(f, { pagina: f.pagina + 1 })}`}>Siguiente</Link> : <span />}
        </nav>
      )}
      <p className="mt-4 text-xs text-muted">
        Los comprobantes del sistema anterior solo indican que se enviaron: no guardan la hora ni el celular o correo, así que se muestran con la fecha del pago.
      </p>
    </div>
  );
}

function Fila({ r }: { r: Comprobante }) {
  const Icono = r.canal === "whatsapp" ? MessageCircle : Mail;
  const tono = r.estado === "enviado" ? "bg-ok-soft text-ok" : r.estado === "error" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn";
  const importe = Number(r.cargo) || Number(r.abono);
  const cuando = r.enviado_en ? fechaHoraCDMX(r.enviado_en)
    : r.estado === "espera" ? "Sale al adjuntar el comprobante" : r.estado === "pendiente" ? "Aún no se envía" : `${fecha(r.fecha)} · sistema anterior`;
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr_auto]" data-comprobante={r.id}>
      <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start">
        <span className={`badge ${tono}`}><Icono className="mr-1 h-3 w-3" aria-hidden />{CANAL_TEXTO[r.canal]} · {ESTADO_TEXTO[r.estado]}</span>
        <span className="text-xs text-muted">{cuando}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{r.proveedor ?? r.descripcion ?? "Sin proveedor"}</p>
        <p className="truncate text-xs text-muted">
          {r.destino ? <span className="num text-text">{r.destino}</span> : r.estado === "enviado" ? "Destino no registrado" : r.estado === "error" ? "Sin celular o correo" : "Sin enviar"}
          {r.enviado_por && <> · envió {r.enviado_por}</>}
        </p>
        <p className="truncate text-xs text-muted">{[r.concepto, r.descripcion, r.leyenda1].filter(Boolean).join(" · ")}</p>
        {r.estado === "error" && r.detalle && <p className="text-xs text-danger">{r.detalle}</p>}
      </div>
      <div className="text-left sm:text-right">
        <p className="num font-semibold">{dinero(importe, r.moneda)}</p>
        <Link href={`/transacciones/${r.cuenta_id}`} className="text-xs text-muted hover:text-primary">
          Pago del {fecha(r.fecha)} · {r.cuenta} · folio {r.folio}
        </Link>
      </div>
    </li>
  );
}
