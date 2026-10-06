// Tipos y utilidades de pagos programados.

export const FRECUENCIAS = [
  { valor: "unica", texto: "Una sola vez" },
  { valor: "semanal", texto: "Semanal" },
  { valor: "quincenal", texto: "Quincenal" },
  { valor: "mensual", texto: "Mensual" },
  { valor: "bimestral", texto: "Bimestral" },
  { valor: "trimestral", texto: "Trimestral" },
  { valor: "cuatrimestral", texto: "Cuatrimestral" },
  { valor: "semestral", texto: "Semestral" },
  { valor: "anual", texto: "Anual" },
] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number]["valor"];

export const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type PagoProgramado = {
  id: number;
  cuenta_id: number | null;
  proveedor_id: number | null;
  concepto_id: number | null;
  descripcion: string;
  cargo: number;
  abono: number;
  referencia: string | null;
  leyenda1: string | null;
  leyenda2: string | null;
  leyenda3: string | null;
  observaciones: string | null;
  frecuencia: Frecuencia;
  dias_mes: number[];
  dia_semana: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  avisar_whatsapp: boolean;
  avisar_correo: boolean;
  clasificaciones: number[];
  proximo: string | null;       // próxima fecha pendiente
  pendientes: number;           // fechas pendientes vencidas (atrasadas)
};

export type Vencimiento = {
  id: number;
  pago_id: number;
  fecha: string;
  estado: "pendiente" | "pagado" | "omitido";
  notas: string | null;
  transaccion_id: number | null;
  pagado_en: string | null;
  importe: number;
  importe_cambiado: boolean;
  tipo: "cargo" | "abono";
  cuenta_id: number | null;
  cuenta: string | null;
  moneda: string;
  proveedor_id: number | null;
  proveedor: string | null;
  concepto_id: number | null;
  concepto: string | null;
  descripcion: string;
  frecuencia: Frecuencia;
  activo: boolean;
  folio: number | null;
  cuenta_pago_id: number | null;
  cuenta_pago: string | null;
  leyenda1: string | null;
  leyenda2: string | null;
};

export function describirFrecuencia(p: Pick<PagoProgramado, "frecuencia" | "dias_mes" | "dia_semana" | "fecha_inicio">) {
  const dias = [...p.dias_mes].sort((a, b) => a - b);
  const mesInicio = MESES[Number(p.fecha_inicio.slice(5, 7)) - 1];
  switch (p.frecuencia) {
    case "unica": return "Una sola vez";
    case "semanal": return `Cada ${DIAS_SEMANA[(p.dia_semana ?? 1) - 1]}`;
    case "quincenal": return `Días ${dias.join(" y ")} de cada mes`;
    case "mensual": return `Día ${dias[0]} de cada mes`;
    case "anual": return `Cada ${dias[0]} de ${mesInicio}`;
    default: return `${FRECUENCIAS.find((f) => f.valor === p.frecuencia)?.texto}, día ${dias[0]} (desde ${mesInicio})`;
  }
}

// Fechas en texto ISO (AAAA-MM-DD) en horario de la Ciudad de México
export function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
}
export function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`;
}
export function moverMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
