import { z } from "zod";

// Lo que la IA debe devolver al leer un estado de cuenta (PDF o XML).
export const esquemaEstado = z.object({
  banco: z.string().describe("Nombre del banco emisor, p. ej. Banamex, BBVA, Scotiabank"),
  tipo_producto: z.enum(["cuenta", "tarjeta_credito", "otro"])
    .describe("cuenta = cheques, ahorro, débito o inversión; tarjeta_credito = tarjeta de crédito"),
  nombre_producto: z.string().describe("Nombre del producto tal como aparece, p. ej. Cuenta Negocios Banamex, Tarjeta Oro"),
  titular: z.string().nullable(),
  terminacion: z.string().nullable().describe("Últimos 4 dígitos del número de cuenta o de tarjeta (solo 4 dígitos)"),
  terminacion_clabe: z.string().nullable().describe("Últimos 4 dígitos de la CLABE, si aparece"),
  moneda: z.string().describe("Código de moneda, p. ej. MXN o USD"),
  periodo_inicio: z.string().nullable().describe("Fecha de inicio del periodo, AAAA-MM-DD"),
  periodo_fin: z.string().nullable().describe("Fecha de corte o fin del periodo, AAAA-MM-DD"),
  saldo_inicial: z.number().nullable().describe("Saldo anterior / al inicio del periodo, tal como lo muestra el banco"),
  saldo_final: z.number().nullable().describe("Saldo al corte / al final del periodo, tal como lo muestra el banco"),
  movimientos: z.array(z.object({
    fecha: z.string().describe("AAAA-MM-DD. En tarjetas de crédito, la fecha de operación"),
    descripcion: z.string().describe("Concepto corto del movimiento, máximo 80 caracteres, p. ej. PAGO INTERBANCARIO A AZTECA"),
    detalle: z.string().describe("Texto completo del movimiento en una sola línea, sin saltos y sin datos de caja/hora/sucursal"),
    contraparte: z.string().nullable().describe("Nombre de quien envía o recibe (ordenante, beneficiario o comercio), si aparece"),
    referencia: z.string().nullable().describe("Número de referencia o cheque, si aparece"),
    cargo: z.number().describe("Importe que sale o que aumenta la deuda (retiros, pagos a terceros, compras, comisiones, IVA). 0 si no aplica"),
    abono: z.number().describe("Importe que entra o que reduce la deuda (depósitos, pagos a la tarjeta, bonificaciones, intereses a favor). 0 si no aplica"),
    saldo: z.number().nullable().describe("Saldo que muestra el banco después del movimiento, si aparece"),
  })),
  notas: z.string().nullable().describe("Advertencias: páginas ilegibles, secciones dudosas, compras a meses, etc."),
});

export type EstadoIA = z.infer<typeof esquemaEstado>;
export type MovimientoIA = EstadoIA["movimientos"][number];

// Fila que se muestra en la vista previa
export type FilaImportacion = MovimientoIA & {
  indice: number;
  estado: "nuevo" | "duplicado" | "posible";
  coincide?: { folio: number; fecha: string };     // movimiento que ya existe
  saldoOk: boolean | null;                         // el saldo del banco cuadra con el acumulado
  proveedor_id: string;                            // sugerido (texto vacío = ninguno)
  concepto_id: string;
  sugerencia?: string;                             // de dónde salió la sugerencia
  copiado?: boolean;                               // se llenó igual que otro renglón parecido
  rev?: number;                                    // cambia cuando se llena solo (para refrescar la lista)
};

export type Cuadre = {
  aplica: boolean;
  ok: boolean;
  saldoInicial: number | null;
  saldoFinal: number | null;
  calculado: number | null;
  diferencia: number | null;
  cargos: number;
  abonos: number;
};

export type Analisis = {
  importacionId: number;
  archivoNombre: string;
  archivoTipo: "pdf" | "xml";
  estado: string;
  datos: Omit<EstadoIA, "movimientos">;
  cuentaId: number | null;
  cuentaDetectada: boolean;
  filas: FilaImportacion[];
  cuadre: Cuadre;
  yaImportado?: string;   // aviso si el mismo archivo ya se importó antes
  regla: { proveedorBanco: number | null; conceptoComision: number | null };   // comisiones → banco que las cobra
};

// Resumen de una lectura, para importar varios estados de cuenta a la vez
export type ResumenLectura = {
  id: number;
  nombre: string;
  banco: string;
  producto: string;
  terminacion: string | null;
  tipo_producto: EstadoIA["tipo_producto"];
  moneda: string;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  movimientos: number;
  cuadra: boolean | null;
  diferencia: number | null;
  cuentaId: number | null;
};
