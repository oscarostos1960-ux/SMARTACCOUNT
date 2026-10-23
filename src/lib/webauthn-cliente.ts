// Lado del navegador: pide al teléfono crear o usar su llave (Face ID / huella / código del teléfono).

const aB64 = (b: ArrayBuffer) => {
  let s = "";
  for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deB64 = (s: string) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

const CLAVE_LOCAL = "sa-llave";   // este dispositivo ya tiene una llave guardada (para mostrar el botón)

export function hayLlaveLocal() {
  try { return !!localStorage.getItem(CLAVE_LOCAL); } catch { return false; }
}
export function recordarLlave(id: string, correo: string) {
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ id, correo })); } catch { /* sin almacenamiento */ }
}
export function olvidarLlave() {
  try { localStorage.removeItem(CLAVE_LOCAL); } catch { /* sin almacenamiento */ }
}
export function llaveLocal(): { id: string; correo: string } | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? "null"); } catch { return null; }
}

// ¿El dispositivo tiene Face ID, huella o similar?
export async function biometriaDisponible() {
  try {
    return typeof window !== "undefined" && !!window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Nombre corto del dispositivo, para la lista de dispositivos activados
export function nombreDispositivo() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Este dispositivo";
}

export async function crearLlave(o: { reto: string; dominio: string; usuarioId: string; correo: string; nombre: string; excluir: string[] }) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: deB64(o.reto),
      rp: { name: "Smart Account", id: o.dominio },
      user: { id: deB64(o.usuarioId), name: o.correo, displayName: o.nombre },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      excludeCredentials: o.excluir.map((id) => ({ type: "public-key" as const, id: deB64(id) })),
      attestation: "none",
      timeout: 60000,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("Se canceló.");
  const r = cred.response as AuthenticatorAttestationResponse;
  const publica = r.getPublicKey?.();
  if (!publica) throw new Error("Este teléfono no permite activar Face ID / huella para Smart Account.");
  return {
    id: aB64(cred.rawId),
    clientDataJSON: aB64(r.clientDataJSON),
    authenticatorData: aB64(r.getAuthenticatorData()),
    publicKey: aB64(publica),
    algoritmo: r.getPublicKeyAlgorithm(),
  };
}

export async function usarLlave(o: { reto: string; dominio: string }, idPreferido?: string) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: deB64(o.reto),
      rpId: o.dominio,
      userVerification: "required",
      allowCredentials: idPreferido ? [{ type: "public-key", id: deB64(idPreferido) }] : [],
      timeout: 60000,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("Se canceló.");
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: aB64(cred.rawId),
    clientDataJSON: aB64(r.clientDataJSON),
    authenticatorData: aB64(r.authenticatorData),
    signature: aB64(r.signature),
  };
}

// Mensaje claro cuando el usuario cancela o el teléfono no deja
export function mensajeError(e: unknown) {
  const n = e instanceof DOMException ? e.name : "";
  if (n === "NotAllowedError" || n === "AbortError") return "No se pudo usar la huella / Face ID. Si tu teléfono dice que no hay un inicio de sesión disponible, entra con tu contraseña y vuelve a activarla en «Contraseña y Face ID / huella».";
  if (n === "InvalidStateError") return "Este dispositivo ya estaba activado.";
  if (n === "SecurityError") return "Face ID / huella solo funciona desde la dirección oficial de Smart Account.";
  return e instanceof Error ? e.message : "No se pudo completar.";
}
