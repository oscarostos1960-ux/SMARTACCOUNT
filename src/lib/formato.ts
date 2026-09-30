// Formatos de dinero y fechas (México).

const formatos = new Map<string, Intl.NumberFormat>();

export function dinero(valor: number | string | null | undefined, moneda = "MXN") {
  let f = formatos.get(moneda);
  if (!f) {
    f = new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, currencyDisplay: "narrowSymbol" });
    formatos.set(moneda, f);
  }
  return f.format(Number(valor ?? 0));
}

// Igual que dinero(), pero agrega la clave si no son pesos: "$300.00 USD"
export function dineroClave(valor: number | string | null | undefined, moneda = "MXN") {
  return moneda === "MXN" ? dinero(valor, moneda) : `${dinero(valor, moneda)} ${moneda}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-09-24" -> "24 sep 2026" (sin conversiones de zona horaria)
export function fecha(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

// Fecha de hoy en la Ciudad de México, formato YYYY-MM-DD
export function hoyCDMX() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

export function sinAcentos(texto: string) {
  return texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
