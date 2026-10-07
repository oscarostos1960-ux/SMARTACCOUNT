// Reporte de comprobantes de pago enviados (vista v_comprobantes_enviados)

export type Comprobante = {
  id: string;
  origen: "smart" | "marca";
  transaccion_id: number;
  cuenta_id: number;
  cuenta: string;
  folio: number;
  fecha: string;
  cargo: number;
  abono: number;
  moneda: string;
  proveedor_id: number | null;
  proveedor: string | null;
  concepto: string | null;
  descripcion: string | null;
  leyenda1: string | null;
  leyenda2: string | null;
  canal: "whatsapp" | "correo";
  destino: string | null;
  estado: "enviado" | "error" | "pendiente";
  detalle: string | null;
  enviado_en: string | null;
  fecha_envio: string;
  enviado_por: string | null;
};

export type FiltrosComprobantes = {
  desde?: string;
  hasta?: string;
  canal?: "whatsapp" | "correo";
  estado?: "enviado" | "error" | "pendiente";
  q?: string;
  pagina: number;
};

export const POR_PAGINA_COMPROBANTES = 100;

const fechaOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export function leerFiltrosComprobantes(sp: Record<string, string | string[] | undefined>): FiltrosComprobantes {
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const canal = uno("canal");
  const estado = uno("estado");
  const q = (uno("q") ?? "").trim().slice(0, 80);
  return {
    desde: fechaOk(uno("desde")),
    hasta: fechaOk(uno("hasta")),
    canal: canal === "whatsapp" || canal === "correo" ? canal : undefined,
    estado: estado === "enviado" || estado === "error" || estado === "pendiente" ? estado : undefined,
    q: q || undefined,
    pagina: Math.max(1, Math.floor(Number(uno("pagina")) || 1)),
  };
}

export function consultaComprobantes(f: FiltrosComprobantes, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  const todo = { desde: f.desde, hasta: f.hasta, canal: f.canal, estado: f.estado, q: f.q, ...extra };
  for (const [k, v] of Object.entries(todo)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Aplica los filtros a una consulta de Supabase sobre v_comprobantes_enviados
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarFiltros<Q extends { gte: any; lte: any; eq: any; or: any }>(
  consulta: Q, f: FiltrosComprobantes, sin: ("canal" | "estado")[] = [],
): Q {
  let c = consulta;
  if (f.desde) c = c.gte("fecha_envio", f.desde);
  if (f.hasta) c = c.lte("fecha_envio", f.hasta);
  if (f.canal && !sin.includes("canal")) c = c.eq("canal", f.canal);
  if (f.estado && !sin.includes("estado")) c = c.eq("estado", f.estado);
  if (f.q) {
    // Sin comas ni paréntesis: rompen la sintaxis del filtro "or"
    const t = f.q.replace(/[,()*%]/g, " ").trim();
    if (t) c = c.or(["proveedor", "destino", "descripcion", "concepto", "cuenta", "leyenda1", "leyenda2"].map((k) => `${k}.ilike.*${t}*`).join(","));
  }
  return c;
}

export const CANAL_TEXTO = { whatsapp: "WhatsApp", correo: "Correo" } as const;
export const ESTADO_TEXTO = { enviado: "Enviado", error: "Con error", pendiente: "Pendiente" } as const;

// "2026-10-07T18:05:00Z" -> "7 oct 2026, 12:05" en hora de la Ciudad de México
export function fechaHoraCDMX(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(/\./g, "");
}
