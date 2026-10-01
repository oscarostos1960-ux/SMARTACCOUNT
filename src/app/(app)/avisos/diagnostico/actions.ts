"use server";

import { obtenerPerfil } from "@/lib/auth";
import { plantilla } from "@/lib/avisos";

// Envía la plantilla de imagen a un celular de prueba, con el formato de número elegido.
export async function enviarPrueba(_prev: { texto?: string }, fd: FormData): Promise<{ texto?: string }> {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") return { texto: "Solo el titular puede hacer pruebas." };
  const digitos = String(fd.get("celular") ?? "").replace(/\D/g, "").slice(-10);
  if (digitos.length !== 10) return { texto: "Escribe un celular de 10 dígitos." };
  const formato = fd.get("formato") === "52" ? "52" : "521";
  const imagen = String(fd.get("imagen") ?? "");
  const r = await plantilla(`${formato}${digitos}`, "Prueba Smart Account", { type: "image", image: { link: imagen } }, "confirmacionpagosacc");
  return { texto: `${formato}${digitos} → ${r.respuesta}` };
}
