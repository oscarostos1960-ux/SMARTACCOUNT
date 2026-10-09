import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText, Output } from "ai";
import { z } from "zod";
import { esquemaEstado, type EstadoIA } from "./esquema";

// Modelo de Claude a través de Vercel AI Gateway (en Vercel se autentica solo, sin clave).
export const MODELO = () => process.env.IMPORTADOR_MODELO || "anthropic/claude-sonnet-4.5";

const INSTRUCCIONES = `Eres un asistente contable en México. Lee el estado de cuenta bancario adjunto y devuelve sus datos.

Reglas:
- Incluye TODOS los movimientos del detalle de operaciones del periodo, en el mismo orden en que aparecen, sin omitir ni repetir ninguno. Si el detalle sigue en varias páginas, júntalas.
- No incluyas como movimiento: "SALDO ANTERIOR", saldos iniciales o finales, totales, resúmenes, tablas de compras a meses que no se cargaron en este periodo, publicidad ni avisos legales.
- Cada movimiento tiene cargo o abono (el otro en 0). Los importes siempre son positivos, con 2 decimales.
  - Cuenta de cheques/ahorro/débito: retiros = cargo; depósitos = abono.
  - Tarjeta de crédito: compras, comisiones, intereses e IVA = cargo; pagos a la tarjeta, devoluciones, reembolsos, cancelaciones y bonificaciones = abono.
  - Si el estado marca cada importe con "+" o "-" (o con columnas de cargos y abonos), respeta esa marca: "+" es cargo y "-" es abono, aunque la descripción sea de una compra (p. ej. una devolución de AMAZON con "-" es abono). El "-" también puede venir al final del importe (p. ej. "$80,000.00-" en Banorte): igual es abono.
  - Las líneas de conversión de moneda debajo de un movimiento (p. ej. "12/09/23 16.0633 USD RT 17.4559") NO son movimientos: agrégalas al "detalle" del movimiento de arriba; el importe es el de pesos.
- Tarjetas de crédito con tarjetas adicionales: incluye los movimientos de TODAS las tarjetas (titular y adicionales). En los de una adicional, termina el "detalle" con "· Tarjeta adicional ****1234" (solo sus últimos 4 dígitos). La "terminacion" del estado es la de la tarjeta titular. En TODOS los movimientos llena "tarjeta" con los últimos 4 dígitos de la tarjeta de su sección (p. ej. "Tarjeta Titular XXXX1117" → "1117", "Tarjeta Adicional XXXX2016" → "2016", también tarjetas digitales).
- En tarjetas de crédito usa la fecha de operación (no la de cargo o aplicación).
- Fechas en formato AAAA-MM-DD; si el estado solo trae día y mes, usa el año del periodo. Si el periodo cruza de año (p. ej. "08 Diciembre al 10 Enero, 2024"), los movimientos de diciembre son del año anterior (2023) y los de enero del año del corte.
- "descripcion": el concepto principal en pocas palabras (máx. 80 caracteres).
- "detalle": el texto completo del movimiento en una línea, quitando datos de CAJA, AUT, HORA y SUC.
- "contraparte": nombre del ordenante, beneficiario o comercio, si aparece.
- Nunca escribas números completos de tarjeta; para la cuenta y la CLABE da solo los últimos 4 dígitos.
- saldo_inicial y saldo_final: tal como los muestra el banco.
  - En tarjeta de crédito: saldo_inicial = "Saldo anterior" o "Adeudo del periodo anterior"; saldo_final = el renglón "=" del resumen de cargos y abonos del periodo, que es exactamente saldo anterior + cargos − abonos según ese mismo resumen. Según el banco se llama "Saldo Final", "Saldo actual al corte" (Banorte) o "Pago para no generar intereses": usa el que sea el resultado de esa suma, aunque exista otro dato parecido. Si la tarjeta quedó con SALDO A FAVOR (pagaste de más), saldo_final es NEGATIVO (p. ej. "Saldo deudor total: -$5,712.04" → -5712.04), aunque "Pago para no generar intereses" diga $0.00; igual, un saldo anterior a favor va negativo en saldo_inicial (si "Pago para no generar intereses" no coincide con esa suma, NO lo uses).
  - Compras a meses (MSI): regístralas como las suma el resumen del banco, para que cuadre.
    - Si el banco suma la compra COMPLETA en el consumo del mes en que se hizo (y luego solo la muestra en una tabla de "plazo fijo" / "meses sin intereses" con el "pago fijo del mes"), registra la compra completa ese mes y NO registres las mensualidades de esa tabla, ni este mes ni los siguientes: ya forman parte del saldo.
    - Si el resumen suma solo la mensualidad de cada mes (p. ej. "Cargos compras a meses (capital)" con un importe mayor a 0, o Banorte, donde la columna "Mensualidad" de "Detalle de programas a plazos" va sumada dentro de "Compras y programas a plazo"), AGREGA un movimiento de cargo por cada mensualidad de la tabla de compras a meses ("Pago requerido"), con la fecha de corte y la descripción "MENSUALIDAD <n>/<total> <comercio>". No basta con mencionarlo en las notas: sin ese movimiento el estado no cuadra. Llena "meses" en resumen_cargos con la suma de esas mensualidades. Esto aplica también a la ÚLTIMA mensualidad (p. ej. 12/12 con "Saldo actual" $0.00): se cobra en este periodo. Un "Saldo programas a plazo" o "saldo pendiente" en 0 solo significa que ya no quedan mensualidades futuras, no que la de este mes no se cobre.
  - Intereses, comisiones e IVA del periodo SIEMPRE van como movimientos de cargo. Muchos bancos no los ponen en el detalle de operaciones sino solo en el resumen o en una sección aparte (p. ej. "Detalle de comisiones"): en ese caso agrégalos tú como movimientos con la fecha de corte ("INTERESES DEL PERIODO", "COMISIONES DEL PERIODO", "IVA DE INTERESES Y COMISIONES"), sin duplicar los que ya aparezcan como renglón en el detalle (p. ej. "PENALIZACION PAGO TARDIO", "ADMON DE TARJ", "ANUALIDAD" ya son la comisión del resumen: no agregues otra). Revisa que "Total cargos" del detalle más lo que agregues dé la suma de cargos del resumen. Llena también "resumen_cargos" con los importes del resumen.
- Si algo no se lee bien, dilo en "notas".`;

// Para XML (CFDI) se quitan sellos y certificados: son largos y no aportan.
function limpiarXml(texto: string) {
  return texto
    .replace(/\s(Sello|Certificado|SelloCFD|SelloSAT)="[^"]*"/g, "")
    .slice(0, 400_000);
}

// Clientes con espacio propio: usan SU clave de Anthropic y la llamada va directo a Anthropic
// (nunca pasa por el crédito de Vercel de Oscar, ni siquiera si su clave falla).
export const URL_CONSOLA_ANTHROPIC = "https://platform.claude.com/settings/billing";
export const URL_CLAVES_ANTHROPIC = "https://platform.claude.com/settings/keys";
const MODELO_DIRECTO = () => process.env.IMPORTADOR_MODELO_DIRECTO || MODELO().replace(/^anthropic\//, "").replace(/\./g, "-");
const URL_API_ANTHROPIC = () => process.env.ANTHROPIC_API_URL || "https://api.anthropic.com";

async function leerConClavePropia(archivo: Buffer, tipo: "pdf" | "xml", nombre: string, clave: string) {
  const modelo = MODELO_DIRECTO();
  const esquema = z.toJSONSchema(esquemaEstado, { target: "draft-7" }) as Record<string, unknown>;
  delete esquema.$schema;
  const contenido = tipo === "pdf"
    ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") }, title: nombre }]
    : [{ type: "text", text: `Archivo XML (${nombre}):\n${limpiarXml(archivo.toString("utf8"))}` }];
  const r = await fetch(`${URL_API_ANTHROPIC()}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 32000,
      temperature: 0,
      system: INSTRUCCIONES,
      tools: [{ name: "estado_de_cuenta", description: "Datos extraídos del estado de cuenta", input_schema: esquema }],
      tool_choice: { type: "tool", name: "estado_de_cuenta" },
      messages: [{ role: "user", content: [...contenido, { type: "text", text: "Extrae los datos de este estado de cuenta." }] }],
    }),
    signal: AbortSignal.timeout(280_000),
  });
  const json = await r.json().catch(() => ({})) as { content?: { type: string; input?: unknown }[]; error?: { type?: string; message?: string } };
  if (!r.ok) {
    const tipoError = json.error?.type ?? "";
    if (r.status === 401 || tipoError === "authentication_error") throw new Error("Tu clave de IA no es válida. Revísala en Mi espacio.");
    if (r.status === 400 && /credit|balance/i.test(json.error?.message ?? "")) throw new Error("Tu cuenta de Anthropic no tiene saldo. Recárgala desde Mi espacio → Recargar crédito.");
    if (r.status === 429) throw new Error("Anthropic limitó tus lecturas por ahora (demasiadas seguidas). Intenta en unos minutos.");
    throw new Error(`Anthropic respondió ${r.status}: ${(json.error?.message ?? "").slice(0, 200)}`);
  }
  const uso = json.content?.find((c) => c.type === "tool_use");
  if (!uso?.input) throw new Error("La IA no devolvió los datos del estado de cuenta.");
  return { datos: esquemaEstado.parse(uso.input), modelo: `anthropic/${modelo} (clave propia)` };
}

export async function leerEstadoConIA(archivo: Buffer, tipo: "pdf" | "xml", nombre: string, clavePropia?: string | null): Promise<{ datos: EstadoIA; modelo: string }> {
  // Pruebas locales: respuestas guardadas en una carpeta (sin llamar a la IA)
  if (process.env.IMPORTADOR_SIMULADO) {
    const espera = Number(process.env.IMPORTADOR_SIMULADO_ESPERA) || 0;
    if (espera) await new Promise((r) => setTimeout(r, espera));
    const json = await readFile(join(process.env.IMPORTADOR_SIMULADO, `${nombre}.json`), "utf8");
    return { datos: esquemaEstado.parse(JSON.parse(json)), modelo: clavePropia ? "simulado (clave propia)" : "simulado" };
  }
  if (clavePropia) return leerConClavePropia(archivo, tipo, nombre, clavePropia);
  const modelo = MODELO();
  const contenido = tipo === "pdf"
    ? [{ type: "file" as const, mediaType: "application/pdf", data: archivo, filename: nombre }]
    : [{ type: "text" as const, text: `Archivo XML (${nombre}):\n${limpiarXml(archivo.toString("utf8"))}` }];
  const { output } = await generateText({
    model: modelo,
    system: INSTRUCCIONES,
    output: Output.object({ schema: esquemaEstado }),
    messages: [{ role: "user", content: [...contenido, { type: "text", text: "Extrae los datos de este estado de cuenta." }] }],
    maxOutputTokens: 32000,
    temperature: 0,
    abortSignal: AbortSignal.timeout(280_000),
  });
  return { datos: output, modelo };
}
