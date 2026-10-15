import "server-only";
import { createHash, createPublicKey, randomBytes, verify as verificarFirma } from "node:crypto";
import { cookies, headers } from "next/headers";

// Comprobación de Face ID / huella (WebAuthn) sin librerías externas.
// El teléfono firma un "reto" con su llave privada; aquí se verifica con la llave pública guardada.

const COOKIE_RETO = "sa_reto";
const VIGENCIA_RETO = 5 * 60;   // segundos

export const b64url = {
  a: (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url"),
  de: (s: string) => Buffer.from(s, "base64url"),
};

// Origen (https://dominio) y dominio desde los que se está usando la app
export async function origenActual() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")).split(",")[0].trim();
  return { origen: `${proto}://${host}`, dominio: host.replace(/:\d+$/, "") };
}

export async function nuevoReto(): Promise<string> {
  const reto = b64url.a(randomBytes(32));
  const c = await cookies();
  const { origen } = await origenActual();
  c.set(COOKIE_RETO, reto, { httpOnly: true, secure: origen.startsWith("https:"), sameSite: "strict", path: "/", maxAge: VIGENCIA_RETO });
  return reto;
}

async function tomarReto(): Promise<string | null> {
  const c = await cookies();
  const reto = c.get(COOKIE_RETO)?.value ?? null;
  c.delete(COOKIE_RETO);
  return reto;
}

type DatosCliente = { type: string; challenge: string; origin: string };

async function revisarDatosCliente(clientDataJSON: string, tipo: "webauthn.create" | "webauthn.get") {
  const reto = await tomarReto();
  const { origen } = await origenActual();
  let datos: DatosCliente;
  try {
    datos = JSON.parse(b64url.de(clientDataJSON).toString("utf8"));
  } catch {
    throw new Error("Respuesta del teléfono no válida.");
  }
  if (datos.type !== tipo) throw new Error("Respuesta del teléfono no válida.");
  if (!reto || datos.challenge !== reto) throw new Error("La verificación tardó demasiado. Vuelve a intentarlo.");
  if (datos.origin !== origen) throw new Error("La verificación no corresponde a este sitio.");
}

// Datos del autenticador: hash del dominio (32) · banderas (1) · contador (4)
function revisarDatosAutenticador(authData: Buffer, dominio: string) {
  if (authData.length < 37) throw new Error("Respuesta del teléfono no válida.");
  const hashDominio = createHash("sha256").update(dominio).digest();
  if (!authData.subarray(0, 32).equals(hashDominio)) throw new Error("La verificación no corresponde a este sitio.");
  const banderas = authData[32];
  if (!(banderas & 0x01)) throw new Error("No se confirmó la presencia del usuario.");
  if (!(banderas & 0x04)) throw new Error("No se verificó tu identidad (Face ID, huella o código del teléfono).");
  return { contador: authData.readUInt32BE(33) };
}

export type DatosRegistro = { id: string; clientDataJSON: string; authenticatorData: string; publicKey: string; algoritmo: number };

// Alta: se comprueba que la respuesta sea de este sitio y de este reto; se guarda la llave pública.
export async function verificarRegistro(r: DatosRegistro) {
  await revisarDatosCliente(r.clientDataJSON, "webauthn.create");
  const { dominio } = await origenActual();
  const { contador } = revisarDatosAutenticador(b64url.de(r.authenticatorData), dominio);
  if (![-7, -257].includes(r.algoritmo)) throw new Error("Tipo de llave no soportado.");
  const der = b64url.de(r.publicKey);
  createPublicKey({ key: der, format: "der", type: "spki" });   // que sea una llave válida
  return { credencial_id: r.id, clave_publica: der.toString("base64"), algoritmo: r.algoritmo, contador, dominio };
}

export type DatosEntrada = { id: string; clientDataJSON: string; authenticatorData: string; signature: string };

// Entrada: firma del teléfono sobre (datos del autenticador + hash de los datos del cliente)
export async function verificarEntrada(r: DatosEntrada, llave: { clave_publica: string; algoritmo: number; contador: number; dominio: string }) {
  await revisarDatosCliente(r.clientDataJSON, "webauthn.get");
  const { dominio } = await origenActual();
  if (dominio !== llave.dominio) throw new Error("Esta llave es de otro sitio.");
  const authData = b64url.de(r.authenticatorData);
  const { contador } = revisarDatosAutenticador(authData, dominio);
  const firmado = Buffer.concat([authData, createHash("sha256").update(b64url.de(r.clientDataJSON)).digest()]);
  const clave = createPublicKey({ key: Buffer.from(llave.clave_publica, "base64"), format: "der", type: "spki" });
  const ok = verificarFirma("sha256", firmado, clave, b64url.de(r.signature));
  if (!ok) throw new Error("No se pudo verificar tu identidad.");
  // Contador: si el teléfono lo usa y retrocede, puede ser una copia de la llave
  if (contador > 0 && llave.contador > 0 && contador <= llave.contador) throw new Error("Llave no válida. Vuelve a activarla.");
  return { contador };
}
