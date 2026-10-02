// Sugerencias de "A favor de" y concepto, por capas (la primera que responda gana):
//   1. Reglas: el comercio (clave) ya se clasificó antes y se guardó la regla.
//   2. Nombre: el texto del movimiento trae el nombre (o una palabra clave) de un "A favor de" del catálogo.
//   3. Historial: movimientos anteriores con texto parecido (respaldo).
// El concepto sale de la regla; si no, del concepto habitual del proveedor; si no, del historial.
// Funciones puras para poder probarlas.

import type { MovimientoIA } from "./esquema";

export type Regla = { id?: number; clave: string; tipo: "cargo" | "abono" | "ambos"; proveedor_id: number | null; concepto_id: number | null };
export type ProveedorCat = { id: number; etiqueta: string; palabras_clave: string | null; concepto_id: number | null; empresa: boolean; activo: boolean };
export type OrigenSugerencia = "regla" | "nombre" | "historial" | "banco";
export type Sugerencia = { proveedor_id: number | null; concepto_id: number | null; origen: OrigenSugerencia; detalle: string };

export const normal = (t: string | null | undefined) =>
  (t ?? "").toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Z0-9*&]+/g, " ").replace(/\s+/g, " ").trim();

// Procesadores de pago que van antes del nombre real del comercio: "ST*UBER", "MERPAGO*SHEINMX", "NETPAY *DERMA"
const PROCESADORES = new Set(["ST", "STR", "SQ", "SP", "MERPAGO", "MERCADOPAGO", "NETPAY", "PAYPAL", "PP", "CLIP", "DLO", "DLOCAL", "OPENPAY", "CONEKTA", "BILLPOCKET", "IZ", "TPV", "POS", "PG", "EBANX"]);
// Palabras que no identifican al comercio (ciudades, países, monedas, palabras de banco, partes de direcciones web)
const RUIDO = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "EN", "AL", "A", "POR", "CON", "SA", "CV", "SAB", "SAPI", "SC", "S", "C", "V", "INC", "LLC", "LTD",
  "MEXICO", "MEX", "MX", "CIUDAD", "CDMX", "DF", "MEXI", "CD", "EDO", "USA", "US", "CAN", "FRA", "ESP", "GBR", "IRL", "NLD", "LUX",
  "MONTERREY", "GUADALAJARA", "TLALPAN", "NAUCALPAN", "COYOACAN", "PARIS", "CEDEX", "MADRID", "LONDON", "AMSTERDAM",
  "CA", "NJ", "NY", "NH", "WA", "TX", "FL", "CO", "MOUNTAIN", "VIEW", "SAN", "FRANCISCO", "LUXEMBOURG", "DUBLIN",
  "COM", "WWW", "HTTP", "HTTPS", "HELP", "BILL", "NET", "ORG", "USD", "EUR", "MXN", "MN", "GBP",
  "REF", "REFERENCIA", "AUT", "SUC", "CAJA", "HORA", "FOLIO", "NO", "NUM", "CTA", "TARJ", "TARJETA", "ADICIONAL", "TITULAR",
]);

/** Clave del comercio: su nombre limpio, para reconocerlo siempre igual. "UBER *TRIP HELP.UBER.COM NH 27.95 EUR" → "UBER". */
export function claveComercio(m: Pick<MovimientoIA, "descripcion" | "contraparte">): string {
  // Transferencias a personas o empresas: la contraparte identifica mejor que el texto del banco
  const contraparte = normal(m.contraparte).replace(/\*/g, " ").split(" ").filter((p) => p && !/\d/.test(p) && !RUIDO.has(p));
  const generico = /^(PAGO|TRANSF|TRASPASO|SPEI|DEPOSITO|ABONO|CARGO|ENVIO|RECIBIDO|COMPRA)\b/.test(normal(m.descripcion));
  if (contraparte.length && (generico || !m.descripcion)) return contraparte.slice(0, 4).join(" ");

  // Fuera el RFC del comercio ("UPM 200220LK5", "ANE 140618P37"): cambia de sucursal y no ayuda a reconocerlo
  let texto = normal(m.descripcion).replace(/\b[A-Z&]{3,4}\s?\d{6}[A-Z0-9]{3}\b/g, " ");
  // "PROCESADOR*COMERCIO" → COMERCIO; "COMERCIO*CODIGO" → COMERCIO
  texto = texto.replace(/\b([A-Z]+)\s*\*\s*([A-Z0-9 ]*)/g, (_, a: string, b: string) => (PROCESADORES.has(a) ? b : a));
  const palabras = texto.replace(/\*/g, " ").split(" ")
    .filter((p) => p.length >= 2 && !/\d/.test(p) && !RUIDO.has(p) && !PROCESADORES.has(p));
  if (palabras.length) return palabras.slice(0, 3).join(" ");
  // Sin palabras útiles: el texto sin números
  return normal(m.descripcion).replace(/[\d*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export const tipoMovimiento = (m: Pick<MovimientoIA, "cargo" | "abono">): "cargo" | "abono" => (m.abono > 0 && m.cargo === 0 ? "abono" : "cargo");

/** Regla que aplica: la de la clave exacta o, si no, la de la clave más larga que sea el inicio de esta ("AMAZON" para "AMAZON DIGITAL"). */
export function buscarRegla(clave: string, tipo: "cargo" | "abono", reglas: Regla[]): Regla | null {
  if (!clave) return null;
  const palabras = clave.split(" ");
  const clavesNorm = reglas.map((r) => normal(r.clave).replace(/\*/g, " ").replace(/\s+/g, " ").trim());
  for (let n = palabras.length; n >= 1; n--) {
    const k = palabras.slice(0, n).join(" ");
    const r = reglas.find((x, i) => clavesNorm[i] === k && (x.tipo === tipo || x.tipo === "ambos"));
    if (r) return r;
  }
  return null;
}

// Nombres que no sirven para reconocer a nadie aunque estén en el catálogo
const GENERICOS = new Set([
  "MEXICO", "BANCO", "SERVICIOS", "GRUPO", "PAGO", "PAGOS", "TRANSFERENCIA", "DESCONOCIDO", "VARIOS", "OTROS", "OTRO", "TIENDA", "COMERCIAL",
  "NACIONAL", "INTERNACIONAL", "SEGUROS", "GOBIERNO", "EFECTIVO", "DEPOSITO", "COMISION", "COMISIONES", "INTERESES", "IVA", "CARGO", "ABONO",
  "SUCURSAL", "LINEA", "GRACIAS", "PRUEBA", "CLIENTE", "PROVEEDOR", "NOMINA", "RENTA", "CASA", "OFICINA", "MOVIL", "DIGITAL", "ONLINE",
]);
const SUFIJOS = /\b(S A B DE C V|S A DE C V|SAB DE CV|SA DE CV|SAPI DE CV|S DE RL DE CV|S DE RL|S C|SC|SA|SAB|CV|INC|LLC|LTD|AC|A C)$/;

type Candidato = { texto: string; proveedor: ProveedorCat };
export function prepararNombres(proveedores: ProveedorCat[]): Candidato[] {
  const salida: Candidato[] = [];
  for (const p of proveedores) {
    if (!p.activo) continue;
    const nombres = new Set<string>();
    const base = normal(p.etiqueta).replace(/[*&]/g, " ").replace(/\s+/g, " ").trim().replace(SUFIJOS, "").trim();
    if (base) nombres.add(base);
    for (const a of (p.palabras_clave ?? "").split(/[,;]/)) { const n = normal(a).replace(/\*/g, " ").trim(); if (n) nombres.add(n); }
    for (const n of nombres) {
      const palabras = n.split(" ");
      // Un nombre de una sola palabra solo sirve si es de empresa y no es genérico (evita "OSCAR", "MEXICO")
      if (n.length < 4 || GENERICOS.has(n)) continue;
      if (palabras.length === 1 && !p.empresa && !p.palabras_clave?.toUpperCase().includes(n)) continue;
      salida.push({ texto: n, proveedor: p });
    }
  }
  // Primero los nombres más largos (más específicos)
  return salida.sort((a, b) => b.texto.length - a.texto.length);
}

/** El "A favor de" cuyo nombre aparece completo dentro del texto del movimiento (palabras enteras). */
export function buscarPorNombre(m: Pick<MovimientoIA, "descripcion" | "contraparte" | "detalle">, candidatos: Candidato[]): Candidato | null {
  const texto = ` ${normal(`${m.descripcion} ${m.contraparte ?? ""} ${m.detalle ?? ""}`).replace(/\*/g, " ")} `;
  let elegido: Candidato | null = null;
  for (const c of candidatos) {
    if (elegido && c.texto.length < elegido.texto.length) break;
    if (texto.includes(` ${c.texto} `)) {
      if (elegido && elegido.proveedor.id !== c.proveedor.id) return null;   // empate entre dos distintos: no se adivina
      elegido = c;
    }
  }
  return elegido;
}

export type ContextoSugerencias = {
  reglas: Regla[];
  candidatos: Candidato[];
  conceptoHabitual: Map<number, number>;          // proveedor → concepto más usado
  historial: (Sugerencia | null)[];                // sugerencia por historial de cada movimiento (capa 3)
};

export function sugerirMovimiento(m: MovimientoIA, i: number, ctx: ContextoSugerencias): Sugerencia | null {
  const clave = claveComercio(m);
  const regla = buscarRegla(clave, tipoMovimiento(m), ctx.reglas);
  const hist = ctx.historial[i];
  const conceptoDe = (prov: number | null) => {
    if (!prov) return null;
    const p = ctx.candidatos.find((c) => c.proveedor.id === prov)?.proveedor;
    return p?.concepto_id ?? ctx.conceptoHabitual.get(prov) ?? null;
  };
  if (regla && (regla.proveedor_id || regla.concepto_id)) {
    return {
      proveedor_id: regla.proveedor_id, concepto_id: regla.concepto_id ?? conceptoDe(regla.proveedor_id) ?? hist?.concepto_id ?? null,
      origen: "regla", detalle: `Regla: ${regla.clave}`,
    };
  }
  const porNombre = buscarPorNombre(m, ctx.candidatos);
  if (porNombre) {
    const prov = porNombre.proveedor.id;
    return {
      proveedor_id: prov, concepto_id: conceptoDe(prov) ?? (hist?.proveedor_id === prov ? hist.concepto_id : null),
      origen: "nombre", detalle: `El texto dice "${porNombre.texto}"`,
    };
  }
  return hist;
}
