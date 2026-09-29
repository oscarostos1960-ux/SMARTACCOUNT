// Tipos y utilidades compartidas de transacciones.

export type SaldoCuenta = {
  cuenta_id: number;
  nombre: string;
  activa: boolean;
  moneda: string;
  tipo_cuenta: string | null;
  naturaleza: string | null;
  banco: string | null;
  saldo_inicial: number;
  saldo: number;
  movimientos: number;
  ultimo_movimiento: string | null;
};

export type Movimiento = {
  id: number;
  cuenta_id: number;
  fecha: string;
  orden: number;
  descripcion: string;
  cargo: number;
  abono: number;
  saldo: number;
  tipo_cambio: number;
  concepto_id: number | null;
  concepto: string | null;
  proveedor_id: number | null;
  proveedor: string | null;
  referencia: string | null;
  leyenda1: string | null;
  leyenda2: string | null;
  leyenda3: string | null;
  observaciones: string | null;
  transferencia_id: string | null;
  es_ajuste: boolean;
  aviso_whatsapp: string | null;
  aviso_correo: string | null;
  clasificaciones: number[];
  total: number;
  total_cargos: number;
  total_abonos: number;
};

export type Filtros = {
  desde?: string;
  hasta?: string;
  texto?: string;
  concepto?: number;
  proveedor?: number;
  clasificacion?: number;
  tipo?: "cargos" | "abonos";
  pagina: number;
};

export const POR_PAGINA = 50;

const esFecha = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const entero = (s: unknown) => {
  const n = Number(s);
  return typeof s === "string" && s !== "" && Number.isInteger(n) && n > 0 ? n : undefined;
};

export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const tipo = uno("tipo");
  return {
    desde: esFecha(uno("desde")) ? uno("desde") : undefined,
    hasta: esFecha(uno("hasta")) ? uno("hasta") : undefined,
    texto: uno("texto")?.trim().slice(0, 100) || undefined,
    concepto: entero(uno("concepto")),
    proveedor: entero(uno("proveedor")),
    clasificacion: entero(uno("clasificacion")),
    tipo: tipo === "cargos" || tipo === "abonos" ? tipo : undefined,
    pagina: entero(uno("pagina")) ?? 1,
  };
}

export function parametrosBusqueda(cuenta: number, f: Filtros, limite = POR_PAGINA, offset = (f.pagina - 1) * POR_PAGINA) {
  return {
    p_cuenta: cuenta,
    p_desde: f.desde ?? null,
    p_hasta: f.hasta ?? null,
    p_texto: f.texto ?? null,
    p_concepto: f.concepto ?? null,
    p_proveedor: f.proveedor ?? null,
    p_clasificacion: f.clasificacion ?? null,
    p_tipo: f.tipo ?? null,
    p_limite: limite,
    p_offset: offset,
  };
}

// Convierte los filtros de vuelta a una cadena de consulta (para enlaces de página y exportar).
export function aConsulta(f: Partial<Filtros>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || (k === "pagina" && v === 1)) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
