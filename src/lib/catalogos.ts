// Definición de los catálogos: una sola fuente para tablas, formularios y validación.

export type TipoCampo =
  | "texto" | "textoLargo" | "correo" | "celular" | "rfc" | "dinero" | "decimal"
  | "codigo" | "color" | "terminacion" | "booleano" | "referencia" | "opciones";

export type Campo = {
  nombre: string;              // columna en la base de datos
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  ayuda?: string;
  enTabla?: boolean;           // mostrar como columna en el listado
  referencia?: { tabla: string; etiqueta: string }; // para tipo "referencia"
  opciones?: { valor: string; etiqueta: string }[];  // para tipo "opciones"
  porDefecto?: string | boolean;
  ancho?: "completo" | "medio";
};

export type Catalogo = {
  clave: string;               // segmento de la URL
  tabla: string;
  titulo: string;              // plural
  singular: string;
  descripcion: string;
  campoActivo: string;         // columna booleana de activo
  orden: string;
  busqueda: string[];          // columnas donde buscar
  campos: Campo[];
};

export const CATALOGOS: Catalogo[] = [
  {
    clave: "cuentas",
    tabla: "cuentas",
    titulo: "Cuentas",
    singular: "cuenta",
    descripcion: "Cuentas de cheques, tarjetas de crédito, inversiones y efectivo.",
    campoActivo: "activa",
    orden: "nombre",
    busqueda: ["nombre", "descripcion"],
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true, ayuda: "Ej. BBVA Cheques personal" },
      { nombre: "banco_id", etiqueta: "Banco", tipo: "referencia", referencia: { tabla: "bancos", etiqueta: "nombre" }, enTabla: true, ancho: "medio" },
      { nombre: "tipo_cuenta_id", etiqueta: "Tipo de cuenta", tipo: "referencia", referencia: { tabla: "tipos_cuenta", etiqueta: "nombre" }, enTabla: true, ancho: "medio" },
      { nombre: "moneda_id", etiqueta: "Moneda", tipo: "referencia", referencia: { tabla: "monedas", etiqueta: "codigo" }, requerido: true, enTabla: true, ancho: "medio" },
      { nombre: "terminacion", etiqueta: "Terminación", tipo: "terminacion", ayuda: "Últimos 4 dígitos", enTabla: true, ancho: "medio" },
      { nombre: "saldo_inicial", etiqueta: "Saldo inicial", tipo: "dinero", porDefecto: "0", enTabla: true, ancho: "medio" },
      { nombre: "descripcion", etiqueta: "Descripción", tipo: "textoLargo" },
    ],
  },
  {
    clave: "proveedores",
    tabla: "proveedores",
    titulo: "Proveedores",
    singular: "proveedor",
    descripcion: "Personas y empresas a las que pagas. Su correo y celular se usan para avisarles cuando pagas.",
    campoActivo: "activo",
    orden: "nombre",
    busqueda: ["nombre", "apellido_paterno", "razon_social", "rfc", "correo", "celular"],
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true },
      { nombre: "apellido_paterno", etiqueta: "Apellido paterno", tipo: "texto", ancho: "medio" },
      { nombre: "apellido_materno", etiqueta: "Apellido materno", tipo: "texto", ancho: "medio" },
      { nombre: "razon_social", etiqueta: "Razón social", tipo: "texto", enTabla: true },
      { nombre: "rfc", etiqueta: "RFC", tipo: "rfc", enTabla: true, ancho: "medio" },
      { nombre: "telefono", etiqueta: "Teléfono", tipo: "texto", ancho: "medio" },
      { nombre: "correo", etiqueta: "Correo", tipo: "correo", enTabla: true, ancho: "medio" },
      { nombre: "celular", etiqueta: "Celular (WhatsApp)", tipo: "celular", ayuda: "10 dígitos", enTabla: true, ancho: "medio" },
      { nombre: "notificar_whatsapp", etiqueta: "Avisar por WhatsApp al pagar", tipo: "booleano", porDefecto: true, ancho: "medio" },
      { nombre: "notificar_correo", etiqueta: "Avisar por correo al pagar", tipo: "booleano", porDefecto: true, ancho: "medio" },
      { nombre: "notas", etiqueta: "Notas", tipo: "textoLargo" },
    ],
  },
  {
    clave: "conceptos",
    tabla: "conceptos",
    titulo: "Conceptos",
    singular: "concepto",
    descripcion: "Conceptos de pago o ingreso (renta, luz, colegiaturas, honorarios…).",
    campoActivo: "activo",
    orden: "nombre",
    busqueda: ["nombre"],
    campos: [{ nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true }],
  },
  {
    clave: "clasificaciones",
    tabla: "clasificaciones",
    titulo: "Clasificaciones",
    singular: "clasificación",
    descripcion: "Etiquetas para agrupar movimientos (deducible, personal, negocio…).",
    campoActivo: "activo",
    orden: "nombre",
    busqueda: ["nombre", "descripcion"],
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true },
      { nombre: "color", etiqueta: "Color", tipo: "color", porDefecto: "#1F3A5F", enTabla: true, ancho: "medio" },
      { nombre: "descripcion", etiqueta: "Descripción", tipo: "textoLargo", enTabla: true },
    ],
  },
  {
    clave: "bancos",
    tabla: "bancos",
    titulo: "Bancos",
    singular: "banco",
    descripcion: "Instituciones financieras.",
    campoActivo: "activo",
    orden: "nombre",
    busqueda: ["nombre"],
    campos: [{ nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true }],
  },
  {
    clave: "monedas",
    tabla: "monedas",
    titulo: "Monedas",
    singular: "moneda",
    descripcion: "Monedas y su tipo de cambio respecto al peso.",
    campoActivo: "activo",
    orden: "codigo",
    busqueda: ["codigo", "nombre"],
    campos: [
      { nombre: "codigo", etiqueta: "Código", tipo: "codigo", requerido: true, ayuda: "3 letras, ej. USD", enTabla: true, ancho: "medio" },
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true, ancho: "medio" },
      { nombre: "tipo_cambio", etiqueta: "Tipo de cambio (pesos)", tipo: "decimal", requerido: true, porDefecto: "1", enTabla: true, ancho: "medio" },
    ],
  },
  {
    clave: "tipos-cuenta",
    tabla: "tipos_cuenta",
    titulo: "Tipos de cuenta",
    singular: "tipo de cuenta",
    descripcion: "Clasificación de las cuentas.",
    campoActivo: "activo",
    orden: "nombre",
    busqueda: ["nombre"],
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, enTabla: true, ancho: "medio" },
      {
        nombre: "naturaleza", etiqueta: "Naturaleza", tipo: "opciones", requerido: true, porDefecto: "otro", enTabla: true, ancho: "medio",
        opciones: [
          { valor: "cheques", etiqueta: "Cheques / débito" },
          { valor: "credito", etiqueta: "Tarjeta de crédito" },
          { valor: "inversion", etiqueta: "Inversión" },
          { valor: "efectivo", etiqueta: "Efectivo" },
          { valor: "otro", etiqueta: "Otro" },
        ],
      },
    ],
  },
];

export function obtenerCatalogo(clave: string) {
  return CATALOGOS.find((c) => c.clave === clave);
}
