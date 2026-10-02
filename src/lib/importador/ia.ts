import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText, Output } from "ai";
import { esquemaEstado, type EstadoIA } from "./esquema";

// Modelo de Claude a través de Vercel AI Gateway (en Vercel se autentica solo, sin clave).
export const MODELO = () => process.env.IMPORTADOR_MODELO || "anthropic/claude-sonnet-4.5";

const INSTRUCCIONES = `Eres un asistente contable en México. Lee el estado de cuenta bancario adjunto y devuelve sus datos.

Reglas:
- Incluye TODOS los movimientos del detalle de operaciones del periodo, en el mismo orden en que aparecen, sin omitir ni repetir ninguno. Si el detalle sigue en varias páginas, júntalas.
- No incluyas como movimiento: "SALDO ANTERIOR", saldos iniciales o finales, totales, resúmenes, tablas de compras a meses que no se cargaron en este periodo, publicidad ni avisos legales.
- Cada movimiento tiene cargo o abono (el otro en 0). Los importes siempre son positivos, con 2 decimales.
  - Cuenta de cheques/ahorro/débito: retiros = cargo; depósitos = abono.
  - Tarjeta de crédito: compras, comisiones, intereses e IVA = cargo; pagos a la tarjeta y bonificaciones = abono.
- Fechas en formato AAAA-MM-DD; si el estado solo trae día y mes, usa el año del periodo.
- "descripcion": el concepto principal en pocas palabras (máx. 80 caracteres).
- "detalle": el texto completo del movimiento en una línea, quitando datos de CAJA, AUT, HORA y SUC.
- "contraparte": nombre del ordenante, beneficiario o comercio, si aparece.
- Nunca escribas números completos de tarjeta; para la cuenta y la CLABE da solo los últimos 4 dígitos.
- saldo_inicial y saldo_final: tal como los muestra el banco (en tarjeta de crédito, el saldo deudor).
- Si algo no se lee bien, dilo en "notas".`;

// Para XML (CFDI) se quitan sellos y certificados: son largos y no aportan.
function limpiarXml(texto: string) {
  return texto
    .replace(/\s(Sello|Certificado|SelloCFD|SelloSAT)="[^"]*"/g, "")
    .slice(0, 400_000);
}

export async function leerEstadoConIA(archivo: Buffer, tipo: "pdf" | "xml", nombre: string): Promise<{ datos: EstadoIA; modelo: string }> {
  // Pruebas locales: respuestas guardadas en una carpeta (sin llamar a la IA)
  if (process.env.IMPORTADOR_SIMULADO) {
    const espera = Number(process.env.IMPORTADOR_SIMULADO_ESPERA) || 0;
    if (espera) await new Promise((r) => setTimeout(r, espera));
    const json = await readFile(join(process.env.IMPORTADOR_SIMULADO, `${nombre}.json`), "utf8");
    return { datos: esquemaEstado.parse(JSON.parse(json)), modelo: "simulado" };
  }
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
