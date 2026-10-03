// Análisis de los movimientos leídos: cuadre de saldos, duplicados y sugerencias.
// Funciones puras (sin base de datos) para poder probarlas.
import type { Cuadre, EstadoIA, FilaImportacion, MovimientoIA } from "./esquema";
import { prepararNombres, sugerirMovimiento, type ProveedorCat, type Regla, type Sugerencia } from "./sugerencias";

export type Existente = { id: number; folio: number; fecha: string; cargo: number; abono: number };
export type Historico = { texto: string; proveedor_id: number | null; concepto_id: number | null };

const redondea = (n: number) => Math.round(n * 100) / 100;

// ---------- Tarjetas: solo los últimos 4 dígitos (mismo criterio que la migración) ----------
function luhn(d: string) {
  let t = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    t += n;
  }
  return t % 10 === 0;
}
export function ocultarTarjetas(texto: string | null) {
  if (!texto) return texto;
  return texto.replace(/(?<![\dA-Za-z])(?:\d[ -]?){14,15}\d(?![\dA-Za-z])/g, (m) => {
    const d = m.replace(/\D/g, "");
    return (d.length === 15 || d.length === 16) && luhn(d) ? `**** ${d.slice(-4)}` : m;
  });
}

// ---------- Cuadre: saldo inicial ± movimientos = saldo final ----------
export function cuadrar(datos: EstadoIA): { cuadre: Cuadre; saldosOk: (boolean | null)[] } {
  const tarjeta = datos.tipo_producto === "tarjeta_credito";
  const signo = (m: MovimientoIA) => (tarjeta ? m.cargo - m.abono : m.abono - m.cargo);
  const cargos = redondea(datos.movimientos.reduce((s, m) => s + m.cargo, 0));
  const abonos = redondea(datos.movimientos.reduce((s, m) => s + m.abono, 0));
  const saldosOk: (boolean | null)[] = [];
  let acumulado = datos.saldo_inicial;
  for (const m of datos.movimientos) {
    if (acumulado === null) { saldosOk.push(null); continue; }
    acumulado = redondea(acumulado + signo(m));
    saldosOk.push(m.saldo === null ? null : Math.abs(acumulado - m.saldo) < 0.015);
    // Si el banco trae saldo por renglón, se sigue desde ese saldo (un error no arrastra a los demás)
    if (m.saldo !== null) acumulado = m.saldo;
  }
  const aplica = datos.saldo_inicial !== null && datos.saldo_final !== null;
  const calculado = aplica ? redondea(datos.saldo_inicial! + datos.movimientos.reduce((s, m) => s + signo(m), 0)) : null;
  const diferencia = aplica ? redondea(datos.saldo_final! - calculado!) : null;
  return {
    cuadre: {
      aplica, ok: aplica && Math.abs(diferencia!) < 0.015,
      saldoInicial: datos.saldo_inicial, saldoFinal: datos.saldo_final, calculado, diferencia, cargos, abonos,
    },
    saldosOk,
  };
}

// ---------- Duplicados: mismo importe y tipo, misma fecha (o hasta 3 días de diferencia) ----------
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;

export function buscarDuplicados(movs: MovimientoIA[], existentes: Existente[]) {
  const usados = new Set<number>();
  const resultado: ({ estado: "duplicado" | "posible"; folio: number; fecha: string } | null)[] = movs.map(() => null);
  const mismo = (m: MovimientoIA, e: Existente) => Math.abs(m.cargo - e.cargo) < 0.005 && Math.abs(m.abono - e.abono) < 0.005;
  // 1a vuelta: misma fecha; 2a vuelta: hasta 3 días (el banco a veces aplica al día siguiente)
  for (const [tolerancia, estado] of [[0, "duplicado"], [3, "posible"]] as const) {
    movs.forEach((m, i) => {
      if (resultado[i]) return;
      const e = existentes.find((x) => !usados.has(x.id) && mismo(m, x) && dias(m.fecha, x.fecha) <= tolerancia);
      if (e) { usados.add(e.id); resultado[i] = { estado, folio: e.folio, fecha: e.fecha }; }
    });
  }
  return resultado;
}

// ---------- Sugerencias de proveedor y concepto según movimientos anteriores ----------
const VACIAS = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "AL", "A", "EN", "POR", "CON", "Y", "SA", "CV", "SAB", "SAPI", "S", "C", "V",
  "PAGO", "PAGOS", "RECIBIDO", "ENVIO", "ENV", "TRANSFERENCIA", "TRANS", "SPEI", "INTERBANCARIO", "INT", "REF", "CTA",
  "RASTREO", "CLAVE", "BENEF", "ORDEN", "ORDENANTE", "BENEFICIARIO", "DATO", "NO", "VERIFICADO", "ESTA", "INSTITUCION",
  "MISMO", "DIA", "SUC", "CAJA", "AUT", "HORA", "BANCO", "MEXICO", "CARGO", "ABONO", "DEPOSITO", "RETIRO",
  // Ciudades, países, monedas y partes de direcciones web: aparecen en compras de comercios muy distintos
  "CIUDAD", "MEX", "CDMX", "MX", "MEXI", "COM", "WWW", "HTTP", "HTTPS", "USD", "EUR", "MXN", "CAN", "USA",
  "MONTERREY", "GUADALAJARA", "TLALPAN", "NAUCALPAN", "PARIS", "CEDEX", "FRA", "MOUNTAIN", "VIEW",
]);
export function palabras(texto: string) {
  return [...new Set(
    texto.toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .split(/[^A-Z0-9]+/)
      .filter((p) => p.length >= 3 && !VACIAS.has(p) && !/^\d{11,}$/.test(p)),
  )];
}

export function sugerir(movs: MovimientoIA[], historial: Historico[]) {
  const docs = historial.map((h) => ({ ...h, p: new Set(palabras(h.texto)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const p of d.p) df.set(p, (df.get(p) ?? 0) + 1);
  const idf = (p: string) => Math.log((docs.length + 1) / ((df.get(p) ?? 0) + 0.5));

  return movs.map((m) => {
    // Solo cuentan las palabras que ya han aparecido antes (las únicas, como rastreos, no ayudan)
    const ps = palabras(`${m.descripcion} ${m.contraparte ?? ""} ${m.detalle}`).filter((p) => df.has(p));
    const total = ps.reduce((s, p) => s + idf(p), 0);
    if (!ps.length || total <= 0) return null;
    let mejor = 0;
    const puntajes = docs.map((d) => {
      const s = ps.reduce((acc, p) => acc + (d.p.has(p) ? idf(p) : 0), 0) / total;
      if (s > mejor) mejor = s;
      return s;
    });
    if (mejor < 0.55) return null;
    // Entre los más parecidos, el proveedor y el concepto que más se repiten, cada uno por separado
    // y sin contar los vacíos: si de 8 movimientos iguales solo 1 tiene proveedor, se sugiere ese proveedor.
    const vp = new Map<number, number>(), vc = new Map<number, number>();
    docs.forEach((d, i) => {
      if (puntajes[i] < mejor * 0.9) return;
      if (d.proveedor_id) vp.set(d.proveedor_id, (vp.get(d.proveedor_id) ?? 0) + 1);
      if (d.concepto_id) vc.set(d.concepto_id, (vc.get(d.concepto_id) ?? 0) + 1);
    });
    const masVotado = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const proveedor_id = masVotado(vp), concepto_id = masVotado(vc);
    return proveedor_id || concepto_id ? { proveedor_id, concepto_id, puntaje: mejor } : null;
  });
}

// ---------- Todo junto: filas de la vista previa ----------
// ---------- Comisiones: siempre a favor del banco que las cobra ----------
export type ReglaBanco = { proveedorBanco: number | null; conceptoComision: number | null };
const ES_COMISION = /COMISI|\bCOM\b|ANUALIDAD|COBRANZA|\bADMON\b|ADMINISTRACION|MEMBRESIA|CUOTA ANUAL|PENALIZ|PAGO TARDIO|FALTA DE PAGO|SOBREGIRO/;
// Texto para reconocer cargos del banco: sin direcciones web (".COM" no es "COM" de comisión)
const textoBanco = (t: string | null | undefined) => normal((t ?? "").replace(/\.(com|net|mx|org)\b/gi, " "));
const ES_CARGO_DEL_BANCO = /COMISI|\bCOM\b|ANUALIDAD|COBRANZA|\bADMON\b|ADMINISTRACION|INTERES|PENALIZ|PAGO TARDIO|FALTA DE PAGO/;   // "IVA" solo no: puede ser un pago de impuestos
// Un abono con la palabra "comisión" suele ser un ingreso (p. ej. comisiones de una aseguradora), no un cobro del banco
const esCargo = (m: Pick<MovimientoIA, "cargo" | "abono">) => m.abono === 0;
export function esComisionBancaria(m: Pick<MovimientoIA, "descripcion" | "cargo" | "abono">, conceptoId: number | null, regla: ReglaBanco) {
  if (regla.conceptoComision && conceptoId === regla.conceptoComision) return true;
  return esCargo(m) && ES_COMISION.test(textoBanco(m.descripcion));
}

export type CatalogosSugerencia = { reglas: Regla[]; proveedores: ProveedorCat[]; conceptoHabitual: Map<number, number> };

export function armarFilas(
  datos: EstadoIA, existentes: Existente[], historial: Historico[],
  regla: ReglaBanco = { proveedorBanco: null, conceptoComision: null },
  catalogos: CatalogosSugerencia = { reglas: [], proveedores: [], conceptoHabitual: new Map() },
) {
  const { cuadre, saldosOk } = cuadrar(datos);
  const dups = buscarDuplicados(datos.movimientos, existentes);
  const porHistorial = sugerir(datos.movimientos, historial).map((h): Sugerencia | null => h && {
    proveedor_id: h.proveedor_id, concepto_id: h.concepto_id, origen: "historial",
    detalle: `Parecido ${Math.round(h.puntaje * 100)}% a movimientos anteriores`,
  });
  const ctx = { reglas: catalogos.reglas, candidatos: prepararNombres(catalogos.proveedores), conceptoHabitual: catalogos.conceptoHabitual, historial: porHistorial };
  const filas: FilaImportacion[] = datos.movimientos.map((m, i) => {
    const s = sugerirMovimiento(m, i, ctx);
    return aplicarReglaBanco({
      ...m,
      descripcion: ocultarTarjetas(m.descripcion) ?? "",
      detalle: ocultarTarjetas(m.detalle) ?? "",
      referencia: ocultarTarjetas(m.referencia),
      indice: i,
      estado: dups[i]?.estado ?? "nuevo",
      coincide: dups[i] ? { folio: dups[i]!.folio, fecha: dups[i]!.fecha } : undefined,
      saldoOk: saldosOk[i],
      proveedor_id: s?.proveedor_id ? String(s.proveedor_id) : "",
      concepto_id: s?.concepto_id ? String(s.concepto_id) : "",
      sugerencia: s?.detalle,
      origen: s?.origen,
    }, regla);
  });
  return { filas, cuadre };
}

// ---------- Renglones parecidos dentro del mismo estado de cuenta ----------
// Para llenar "A favor de" / "Concepto" en los demás renglones iguales al que el usuario acaba de clasificar.
type Comparable = Pick<MovimientoIA, "descripcion" | "contraparte" | "detalle" | "cargo" | "abono">;
const normal = (t: string | null) => (t ?? "").toUpperCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Z0-9]+/g, " ").trim();
const tipoMov = (m: Comparable) => (m.cargo > 0 ? "c" : m.abono > 0 ? "a" : "0");

export function esParecido(a: Comparable, b: Comparable) {
  if (tipoMov(a) !== tipoMov(b)) return false;                       // un pago y un depósito no son lo mismo
  const ca = normal(a.contraparte), cb = normal(b.contraparte);
  if (ca && cb) return ca === cb;                                    // mismo beneficiario u ordenante (aunque cambie el banco)
  // Se comparan las palabras (sin folios, referencias ni claves con números), incluido el detalle,
  // donde muchas veces viene el beneficiario (p. ej. "PAGO A TERCEROS ... AL BENEF GABRIELA ...")
  const clave = (m: Comparable) => new Set(palabras(`${m.descripcion} ${m.contraparte ?? ""} ${m.detalle ?? ""}`).filter((p) => !/\d/.test(p)));
  const pa = clave(a), pb = clave(b);
  if (!pa.size || !pb.size) return normal(a.descripcion) === normal(b.descripcion) && !!normal(a.descripcion);
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return comunes / Math.max(pa.size, pb.size) >= 0.6;
}

// Comisiones, intereses e IVA que cobra el banco: el "A favor de" es el banco del estado de cuenta
// (aunque en otras cuentas se haya usado otro banco). A las comisiones además se les pone el concepto Comisión bancaria.
export function aplicarReglaBanco(f: FilaImportacion, regla: ReglaBanco): FilaImportacion {
  if (!regla.proveedorBanco) return f;
  // El concepto solo cuenta si lo enseñó el usuario (regla); uno sugerido por "concepto habitual" no basta
  const conceptoSeguro = f.origen === "regla" && f.concepto_id ? Number(f.concepto_id) : null;
  const comision = esComisionBancaria(f, conceptoSeguro, regla);
  if (!comision && !(esCargo(f) && ES_CARGO_DEL_BANCO.test(textoBanco(f.descripcion)))) return f;
  return {
    ...f,
    proveedor_id: String(regla.proveedorBanco),
    concepto_id: f.concepto_id || (comision && regla.conceptoComision ? String(regla.conceptoComision) : ""),
    sugerencia: "Cargo del banco: a favor del banco que lo cobra",
    origen: "banco",
  };
}

// ---------- Cargos del banco que solo vienen en el resumen ----------
// Algunas tarjetas (p. ej. Scotiabank) muestran intereses e IVA solo en el resumen y no en el detalle.
// Si el resumen trae un importe que no está entre los movimientos, se agrega como cargo con la fecha de corte.
export function completarCargosDelResumen(datos: EstadoIA): EstadoIA {
  const r = datos.resumen_cargos;
  if (!r || datos.tipo_producto !== "tarjeta_credito") return datos;
  const fecha = datos.periodo_fin ?? datos.movimientos.at(-1)?.fecha ?? "";
  // Solo la descripción (el detalle trae direcciones web: "Amzn.com" no es una comisión)
  const n = (m: MovimientoIA) => textoBanco(m.descripcion);
  const grupos: [number | null, (m: MovimientoIA) => boolean, string][] = [
    [r.intereses, (m) => /INTERES/.test(n(m)) && !/\bIVA\b/.test(n(m)), "INTERESES DEL PERIODO"],
    [r.comisiones, (m) => ES_COMISION.test(n(m)) && !/\bIVA\b/.test(n(m)), "COMISIONES DEL PERIODO"],
    [r.iva, (m) => /\bIVA\b/.test(n(m)), "IVA DE INTERESES Y COMISIONES"],
  ];
  const extra: MovimientoIA[] = [];
  for (const [total, es, nombre] of grupos) {
    if (!total || total <= 0) continue;
    const ya = redondea(datos.movimientos.filter((m) => m.cargo > 0 && es(m)).reduce((s, m) => s + m.cargo, 0));
    const falta = redondea(total - ya);
    if (falta >= 0.01) extra.push({
      fecha, descripcion: nombre, detalle: `${nombre} (tomado del resumen del estado de cuenta)`,
      contraparte: null, referencia: null, cargo: falta, abono: 0, saldo: null,
    });
  }
  if (!extra.length) return datos;
  // Si el estado trae saldos, solo se agregan los que hacen que cuadre exacto (si ya cuadra, nada)
  const { cuadre } = cuadrar(datos);
  if (!cuadre.aplica) return { ...datos, movimientos: [...datos.movimientos, ...extra] };
  if (cuadre.ok) return datos;
  for (let mask = (1 << extra.length) - 1; mask > 0; mask--) {
    const elegidos = extra.filter((_, k) => mask & (1 << k));
    if (cuadrar({ ...datos, movimientos: [...datos.movimientos, ...elegidos] }).cuadre.ok) {
      return { ...datos, movimientos: [...datos.movimientos, ...elegidos] };
    }
  }
  return datos;
}

// ---------- Cargos del resumen repetidos ----------
// La IA a veces agrega "COMISIONES DEL PERIODO" (o intereses / IVA) aunque ese cargo ya venga en el detalle
// con otro nombre (p. ej. "PENALIZACION PAGO TARDIO"). Si el estado tiene cargos de más, se quitan los renglones
// agregados del resumen cuya suma es exactamente lo que sobra.
const ES_RENGLON_DEL_RESUMEN = /^(INTERESES|COMISIONES|IVA)\b.*(DEL PERIODO|INTERESES Y COMISIONES)/;
export function quitarCargosDelResumenRepetidos(datos: EstadoIA): EstadoIA {
  if (datos.tipo_producto !== "tarjeta_credito") return datos;
  const { cuadre } = cuadrar(datos);
  if (!cuadre.aplica || cuadre.ok || cuadre.diferencia === null || cuadre.diferencia >= 0) return datos;
  const sobra = -cuadre.diferencia;
  const candidatos = datos.movimientos.map((m, i) => ({ m, i }))
    .filter(({ m }) => m.cargo > 0 && m.abono === 0 && ES_RENGLON_DEL_RESUMEN.test(textoBanco(m.descripcion)));
  if (!candidatos.length || candidatos.length > 8) return datos;
  for (let mask = 1; mask < (1 << candidatos.length); mask++) {
    let suma = 0;
    candidatos.forEach((c, k) => { if (mask & (1 << k)) suma += c.m.cargo; });
    if (Math.abs(redondea(suma) - sobra) < 0.015) {
      const quitar = new Set(candidatos.filter((_, k) => mask & (1 << k)).map((c) => c.i));
      const notas = [datos.notas, `Se quitaron ${quitar.size} cargo(s) del resumen que ya venían en el detalle con otro nombre.`].filter(Boolean).join(" ");
      return { ...datos, movimientos: datos.movimientos.filter((_, i) => !quitar.has(i)), notas };
    }
  }
  return datos;
}

// ---------- Mensualidades de meses sin intereses que sobran ----------
// En algunos formatos (p. ej. Scotiabank anterior) la compra a meses ya se sumó completa el mes en que se hizo,
// y la tabla de "plazo fijo" solo informa la mensualidad. Si la IA las registró como cargo y por eso el estado
// no cuadra, se quitan las que sobran (solo si quitándolas cuadra exacto).
const ES_MENSUALIDAD = /PAGO FIJO|MENSUALIDAD|\bMSI\b|MESES SIN INTERESES|PLAZO FIJO/;
export function quitarMensualidadesSobrantes(datos: EstadoIA): EstadoIA {
  if (datos.tipo_producto !== "tarjeta_credito") return datos;
  const { cuadre } = cuadrar(datos);
  if (!cuadre.aplica || cuadre.ok || cuadre.diferencia === null || cuadre.diferencia >= 0) return datos;
  const sobra = -cuadre.diferencia;   // hay cargos de más
  const candidatos = datos.movimientos.map((m, i) => ({ m, i })).filter(({ m }) => m.cargo > 0 && ES_MENSUALIDAD.test(normal(`${m.descripcion} ${m.detalle}`)));
  if (!candidatos.length || candidatos.length > 12) return datos;
  // Busca la combinación de mensualidades que suma exactamente lo que sobra
  for (let mask = (1 << candidatos.length) - 1; mask > 0; mask--) {
    let suma = 0;
    candidatos.forEach((c, k) => { if (mask & (1 << k)) suma += c.m.cargo; });
    if (Math.abs(redondea(suma) - sobra) < 0.015) {
      const quitar = new Set(candidatos.filter((_, k) => mask & (1 << k)).map((c) => c.i));
      const notas = [datos.notas, `Se quitaron ${quitar.size} mensualidad(es) de meses sin intereses que el banco ya había sumado completas en el mes de la compra.`].filter(Boolean).join(" ");
      return { ...datos, movimientos: datos.movimientos.filter((_, i) => !quitar.has(i)), notas };
    }
  }
  return datos;
}
