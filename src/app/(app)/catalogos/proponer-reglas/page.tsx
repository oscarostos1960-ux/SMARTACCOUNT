import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { proponerReglas } from "@/lib/importador/proponer";
import ProponerVista from "./ProponerVista";

export const metadata: Metadata = { title: "Proponer reglas" };
export const maxDuration = 60;

export default async function ProponerReglasPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") redirect("/catalogos/reglas");
  const supabase = await createClient();
  const [propuestas, provR, concR] = await Promise.all([
    proponerReglas(supabase),
    supabase.from("v_proveedores_etiqueta").select("id, etiqueta").limit(5000),
    supabase.from("conceptos").select("id, nombre").limit(5000),
  ]);
  const proveedores = Object.fromEntries((provR.data ?? []).map((p) => [Number(p.id), String(p.etiqueta)]));
  const conceptos = Object.fromEntries((concR.data ?? []).map((c) => [Number(c.id), String(c.nombre)]));
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Catálogos · Reglas de clasificación</p>
        <h1 className="text-2xl font-semibold tracking-tight">Proponer reglas desde el historial</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Comercios que en tus movimientos ya guardados siempre se clasificaron igual. Palomea los que quieras convertir en regla:
          al importar, esos comercios se llenarán solos con este &quot;A favor de&quot; y concepto.
        </p>
      </header>
      <ProponerVista propuestas={propuestas} proveedores={proveedores} conceptos={conceptos} />
    </div>
  );
}
