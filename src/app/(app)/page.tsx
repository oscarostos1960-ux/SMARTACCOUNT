import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/auth";
import { Landmark, Users, Tag, Tags, CheckCircle2, Circle } from "lucide-react";

const FASES = [
  { n: 1, texto: "Acceso seguro y catálogos", lista: true },
  { n: 2, texto: "Transacciones y saldos", lista: false },
  { n: 3, texto: "Pagos programados con aviso por WhatsApp y correo", lista: false },
  { n: 4, texto: "Importación de estados de cuenta sin duplicados", lista: false },
  { n: 5, texto: "Reportes, tablero y vista del contador", lista: false },
  { n: 6, texto: "Migración de tus datos y comprobantes", lista: false },
];

export default async function Inicio() {
  const perfil = await obtenerPerfil();
  const supabase = await createClient();
  const contar = async (tabla: string, activo: string) =>
    (await supabase.from(tabla).select("id", { count: "exact", head: true }).eq(activo, true)).count ?? 0;

  const [cuentas, proveedores, conceptos, clasificaciones] = await Promise.all([
    contar("cuentas", "activa"), contar("proveedores", "activo"),
    contar("conceptos", "activo"), contar("clasificaciones", "activo"),
  ]);

  const tarjetas = [
    { texto: "Cuentas", valor: cuentas, href: "/catalogos/cuentas", icono: Landmark },
    { texto: "Proveedores", valor: proveedores, href: "/catalogos/proveedores", icono: Users },
    { texto: "Conceptos", valor: conceptos, href: "/catalogos/conceptos", icono: Tag },
    { texto: "Clasificaciones", valor: clasificaciones, href: "/catalogos/clasificaciones", icono: Tags },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {perfil.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">
          {perfil.rol === "contador" ? "Tienes acceso de consulta a la información." : "Este es el resumen de tu Smart Account."}
        </p>
      </header>

      <section aria-label="Resumen de catálogos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map(({ texto, valor, href, icono: Icono }) => (
          <Link key={href} href={href} className="card group p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{texto}</p>
              <Icono className="h-4 w-4 text-muted group-hover:text-primary" aria-hidden />
            </div>
            <p className="num mt-2 text-3xl font-semibold text-primary">{valor}</p>
            <p className="mt-1 text-xs text-muted">activos</p>
          </Link>
        ))}
      </section>

      <section className="card mt-8 p-6" aria-labelledby="avance">
        <h2 id="avance" className="font-semibold">Avance del nuevo Smart Account</h2>
        <ol className="mt-4 space-y-3">
          {FASES.map((f) => (
            <li key={f.n} className="flex items-center gap-3 text-sm">
              {f.lista
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-label="Listo" />
                : <Circle className="h-5 w-5 shrink-0 text-border" aria-label="Pendiente" />}
              <span className={f.lista ? "font-medium" : "text-muted"}>Fase {f.n}: {f.texto}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
