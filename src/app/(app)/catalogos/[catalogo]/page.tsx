import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { CATALOGOS, obtenerCatalogo } from "@/lib/catalogos";
import CatalogoVista, { type Opcion, type Registro } from "@/components/CatalogoVista";

export function generateStaticParams() {
  return CATALOGOS.map((c) => ({ catalogo: c.clave }));
}

export async function generateMetadata(props: PageProps<"/catalogos/[catalogo]">): Promise<Metadata> {
  const { catalogo } = await props.params;
  return { title: obtenerCatalogo(catalogo)?.titulo ?? "Catálogo" };
}

export default async function CatalogoPage(props: PageProps<"/catalogos/[catalogo]">) {
  const { catalogo: clave } = await props.params;
  const catalogo = obtenerCatalogo(clave);
  if (!catalogo) notFound();

  const perfil = await obtenerPerfil();
  const supabase = await createClient();

  const { data: registros, error } = await supabase
    .from(catalogo.tabla)
    .select("*")
    .order(catalogo.orden, { ascending: true })
    .limit(5000);

  // Listas para los campos que apuntan a otro catálogo
  const referencias: Record<string, Opcion[]> = {};
  for (const campo of catalogo.campos) {
    if (campo.tipo !== "referencia" || !campo.referencia) continue;
    const { data } = await supabase
      .from(campo.referencia.tabla)
      .select(`id, ${campo.referencia.etiqueta}`)
      .order(campo.referencia.etiqueta);
    referencias[campo.nombre] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      valor: String(r.id),
      etiqueta: String(r[campo.referencia!.etiqueta] ?? ""),
    }));
  }

  // Cuántos movimientos usa cada registro (para detectar y fusionar duplicados)
  const fusionable = ["proveedores", "conceptos", "clasificaciones"].includes(catalogo.clave);
  let usos: Record<number, number> | undefined;
  if (fusionable) {
    const { data } = await supabase.rpc("conteo_usos", { p_catalogo: catalogo.clave });
    usos = Object.fromEntries(((data ?? []) as { id: number; usos: number }[]).map((u) => [Number(u.id), Number(u.usos)]));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Catálogos</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">{catalogo.titulo}</h1>
          <p className="mt-1 text-sm text-muted">{catalogo.descripcion}</p>
        </div>
        {catalogo.accion && perfil.rol === "titular" && <Link href={catalogo.accion.href} className="btn-secondary">{catalogo.accion.texto}</Link>}
      </header>
      {error ? (
        <p className="card p-6 text-sm text-danger">No se pudo cargar la información: {error.message}</p>
      ) : (
        <CatalogoVista
          clave={catalogo.clave}
          registros={(registros ?? []) as Registro[]}
          referencias={referencias}
          puedeEditar={perfil.rol === "titular"}
          usos={usos}
        />
      )}
    </div>
  );
}
