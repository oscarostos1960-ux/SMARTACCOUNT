import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerPermisos } from "@/lib/auth";
import { leerArchivo, resumir } from "@/lib/importador/leer";

// Lectura de un estado de cuenta para importar varios a la vez. Es una ruta (y no una
// acción del servidor) para que el navegador pueda leer varios archivos en paralelo.
export const maxDuration = 300;

export async function POST(req: Request) {
  let cuerpo: { ruta?: string; nombre?: string; tipo?: string; huella?: string | null };
  try { cuerpo = await req.json(); } catch { return Response.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const { ruta, nombre, tipo, huella } = cuerpo;
  if (typeof ruta !== "string" || typeof nombre !== "string" || (tipo !== "pdf" && tipo !== "xml")) {
    return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const permisos = await obtenerPermisos();
  const supabase = await createClient();
  const r = await leerArchivo(supabase, permisos, ruta, nombre, tipo, typeof huella === "string" ? huella : null);
  revalidatePath("/importar");
  if ("error" in r) return Response.json({ error: r.error, id: r.id ?? null });
  return Response.json({ resumen: resumir(r.id, nombre, r.datos, r.cuentaId) });
}
