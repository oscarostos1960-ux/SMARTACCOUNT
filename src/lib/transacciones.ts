// Tipos y utilidades compartidas de movimientos (por cuenta y reporte de varias cuentas).

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

export type CuentaCorta = { cuenta_id: number; nombre: string; moneda: string; activa: boolean };

export type Movimiento = {
  id: number;
  cuenta_id: number;
  cuenta: string;
  moneda: string;
  folio: number;
  fecha: string;
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
  documentos: number;
  total: number;
};

export type Totales = { moneda: string; movimientos: number; cargos: number; abonos: number };

export type Filtros = {
  cuentas?: number[];          // solo en el reporte; vacío = todas
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

// Columnas que se pueden mostrar u ocultar en las listas de movimientos
export type ClaveColumna =
  | "folio" | "fecha" | "cuenta" | "proveedor" | "concepto" | "descripcion" | "referencia"
  | "leyenda1" | "leyenda2" | "leyenda3" | "cargo" | "abono" | "saldo" | "clasificaciones"
  | "observaciones" | "documentos";

export const COLUMNAS: { clave: ClaveColumna; etiqueta: string; numero?: boolean }[] = [
  { clave: "folio", etiqueta: "Folio", numero: true },
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "cuenta", etiqueta: "Cuenta" },
  { clave: "proveedor", etiqueta: "A favor de" },
  { clave: "concepto", etiqueta: "Concepto" },
  { clave: "descripcion", etiqueta: "Transacción" },
  { clave: "referencia", etiqueta: "Cheque / referencia" },
  { clave: "leyenda1", etiqueta: "Leyenda 1" },
  { clave: "leyenda2", etiqueta: "Leyenda 2" },
  { clave: "leyenda3", etiqueta: "Leyenda 3" },
  { clave: "cargo", etiqueta: "Cargo", numero: true },
  { clave: "abono", etiqueta: "Abono", numero: true },
  { clave: "saldo", etiqueta: "Saldo", numero: true },
  { clave: "clasificaciones", etiqueta: "Clasificaciones" },
  { clave: "observaciones", etiqueta: "Observaciones" },
  { clave: "documentos", etiqueta: "Documentos" },
];

export const COLUMNAS_CUENTA: ClaveColumna[] = ["folio", "fecha", "proveedor", "concepto", "descripcion", "leyenda1", "leyenda2", "cargo", "abono", "saldo", "documentos"];
export const COLUMNAS_REPORTE: ClaveColumna[] = ["folio", "fecha", "cuenta", "proveedor", "concepto", "leyenda1", "leyenda2", "cargo", "abono", "saldo", "documentos"];

export function leerColumnas(texto: string | undefined | null, porDefecto: ClaveColumna[]): ClaveColumna[] {
  if (!texto) return porDefecto;
  const validas = new Set(COLUMNAS.map((c) => c.clave));
  const lista = texto.split(",").filter((c): c is ClaveColumna => validas.has(c as ClaveColumna));
  return lista.length ? lista : porDefecto;
}

const esFecha = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const entero = (s: unknown) => {
  const n = Number(s);
  return typeof s === "string" && s !== "" && Number.isInteger(n) && n > 0 ? n : undefined;
};

export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const tipo = uno("tipo");
  const cuentas = (uno("cuentas") ?? "").split(",").map((x) => entero(x)).filter((x): x is number => !!x);
  return {
    cuentas: cuentas.length ? cuentas : undefined,
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

// Parámetros para las funciones filtrar/buscar/totales_movimientos de la base de datos
export function parametrosFiltro(cuentas: number[] | null, f: Filtros) {
  return {
    p_cuentas: cuentas && cuentas.length ? cuentas : null,
    p_desde: f.desde ?? null,
    p_hasta: f.hasta ?? null,
    p_texto: f.texto ?? null,
    p_concepto: f.concepto ?? null,
    p_proveedor: f.proveedor ?? null,
    p_clasificacion: f.clasificacion ?? null,
    p_tipo: f.tipo ?? null,
  };
}

export function parametrosBusqueda(
  cuentas: number[] | null, f: Filtros, orden: "folio" | "fecha",
  limite = POR_PAGINA, offset = (f.pagina - 1) * POR_PAGINA,
) {
  return { ...parametrosFiltro(cuentas, f), p_orden: orden, p_limite: limite, p_offset: offset };
}

// Convierte los filtros de vuelta a una cadena de consulta (para enlaces de página y exportar).
export function aConsulta(f: Partial<Filtros> & Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || (k === "pagina" && v === 1)) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(","));
      continue;
    }
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
