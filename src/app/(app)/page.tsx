import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerEspacio, obtenerPerfil } from "@/lib/auth";
import { Landmark, Users, Tag, Tags, CheckCircle2, Circle, ChevronRight, CalendarClock, CircleDot, CreditCard, Building2 } from "lucide-react";
import ResumenSaldos from "@/components/ResumenSaldos";
import { caraTarjeta } from "@/components/Plastico";
import { dinero, dineroClave, fecha, hoyCDMX, hoyLargo } from "@/lib/formato";
import { sumarDias } from "@/lib/pagos";
import type { SaldoCuenta } from "@/lib/transacciones";

const FASES: { n: number; texto: string; estado: "lista" | "curso" | "pendiente" }[] = [
  { n: 1, texto: "Acceso seguro y catálogos", estado: "lista" },
  { n: 2, texto: "Transacciones y saldos", estado: "lista" },
  { n: 3, texto: "Pagos programados y avisos por WhatsApp y correo", estado: "lista" },
  { n: 4, texto: "Importación de estados de cuenta con IA", estado: "lista" },
  { n: 5, texto: "Reportes, tablero y vista del contador", estado: "curso" },
  { n: 6, texto: "Comprobantes del sistema anterior", estado: "pendiente" },
];

export default async function Inicio() {
  const [perfil, espacio] = await Promise.all([obtenerPerfil(), obtenerEspacio()]);
  const supabase = await createClient();
  const contar = async (tabla: string, activo: string) =>
    (await supabase.from(tabla).select("id", { count: "exact", head: true }).eq(activo, true)).count ?? 0;

  const contarTodos = async (tabla: string) => (await supabase.from(tabla).select("id", { count: "exact", head: true })).count ?? 0;
  const hoy = hoyCDMX();
  const [cuentas, proveedores, conceptos, clasificaciones, saldosR, pagosR] = await Promise.all([
    contar("cuentas", "activa"), contar("proveedores", "activo"),
    contar("conceptos", "activo"), contar("clasificaciones", "activo"),
    supabase.from("v_saldos_cuentas").select("*").eq("activa", true).order("ultimo_movimiento", { ascending: false, nullsFirst: false }),
    supabase.from("v_vencimientos").select("id, fecha, importe, moneda, tipo, proveedor, concepto, descripcion")
      .eq("estado", "pendiente").lte("fecha", sumarDias(hoy, 7)).order("fecha").limit(200),
  ]);
  type Proximo = { id: number; fecha: string; importe: number; moneda: string; tipo: string; proveedor: string | null; concepto: string | null; descripcion: string };
  const proximos = (pagosR.data ?? []) as Proximo[];
  const vencidos = proximos.filter((p) => p.fecha < hoy).length;
  const saldos = (saldosR.data ?? []) as SaldoCuenta[];

  const tarjetas = [
    { texto: "Cuentas", valor: cuentas, href: "/catalogos/cuentas", icono: Landmark, chip: "bg-primary-soft text-primary" },
    { texto: "Proveedores", valor: proveedores, href: "/catalogos/proveedores", icono: Users, chip: "bg-accent-soft text-accent-strong" },
    { texto: "Conceptos", valor: conceptos, href: "/catalogos/conceptos", icono: Tag, chip: "bg-ok-soft text-ok" },
    { texto: "Clasificaciones", valor: clasificaciones, href: "/catalogos/clasificaciones", icono: Tags, chip: "bg-warn-soft text-warn" },
  ];

  // Espacios de clientes: en lugar del avance del proyecto, una guía de primeros pasos
  const pasos = espacio.principal ? [] : [
    { texto: "Agrega tu clave de IA para leer estados de cuenta", listo: !!espacio.ia_clave_fin, href: "/mi-espacio#ia", soloTitular: true },
    { texto: "Da de alta tus bancos", listo: (await contarTodos("bancos")) > 0, href: "/catalogos/bancos" },
    { texto: "Crea tus cuentas (cheques y tarjetas, con sus últimos 4 dígitos)", listo: cuentas > 0, href: "/catalogos/cuentas" },
    { texto: "Registra a tus proveedores", listo: proveedores > 0, href: "/catalogos/proveedores" },
    { texto: "Crea tus clasificaciones (por ejemplo: Casa, Oficina)", listo: clasificaciones > 0, href: "/catalogos/clasificaciones" },
    { texto: "Importa tu primer estado de cuenta", listo: (await contarTodos("importaciones")) > 0, href: "/importar" },
    { texto: "Opcional: configura tu correo para los avisos de pago", listo: espacio.smtp_activo, href: "/mi-espacio#correo", soloTitular: true },
  ].filter((p) => !p.soloTitular || perfil.rol === "titular");

  const tarjetasCredito = saldos.filter((c) => c.naturaleza === "credito").sort((a, b) => a.nombre.localeCompare(b.nombre));
  const colorDe = new Map(tarjetasCredito.map((c, i) => [c.cuenta_id, caraTarjeta(c.nombre, i)]));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-sm font-semibold text-accent-strong">{hoyLargo()}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-primary">Hola, {perfil.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">
          {perfil.rol === "usuario" ? "Tienes acceso a las cuentas que te asignó el titular." : "Este es el resumen de tu Smart Account."}
        </p>
      </header>

      <ResumenSaldos activas={saldos} />

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="proximos">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="proximos" className="flex items-center gap-2 text-base font-extrabold text-primary">
              <CalendarClock className="h-4 w-4 text-accent-strong" aria-hidden /> Pagos de esta semana
              {vencidos > 0 && <span className="badge bg-danger-soft text-danger">{vencidos} vencido{vencidos > 1 ? "s" : ""}</span>}
            </h2>
            <Link href="/pagos-programados" className="text-sm font-semibold text-accent-strong hover:underline">Ver todos</Link>
          </div>
          {proximos.length === 0 ? (
            <p className="card px-5 py-6 text-sm text-muted">No hay pagos en los próximos 7 días.</p>
          ) : (
            <ul className="card divide-y divide-border">
              {proximos.slice(0, 8).map((p) => {
                const vencido = p.fecha < hoy;
                const [, mes, dia] = p.fecha.split("-");
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`flex w-11 shrink-0 flex-col items-center rounded-lg border py-0.5 ${vencido ? "border-danger text-danger" : p.fecha === hoy ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border"}`} data-mes={mes}>
                      <span className="num text-base font-extrabold leading-tight">{Number(dia)}</span>
                      <span className="text-[10px] uppercase text-muted">{fecha(p.fecha).split(" ")[1]}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.proveedor ?? p.concepto ?? p.descripcion}</span>
                    <span className="num font-bold">{Number(p.importe) > 0 ? dineroClave(p.importe, p.moneda) : "Variable"}</span>
                  </li>
                );
              })}
              {proximos.length > 8 && (
                <li><Link href="/pagos-programados" className="block px-5 py-2.5 text-sm font-semibold text-accent-strong hover:underline">y {proximos.length - 8} más…</Link></li>
              )}
            </ul>
          )}
        </section>

        {saldos.length > 0 && (
          <section aria-labelledby="saldos">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="saldos" className="text-base font-extrabold text-primary">Saldos de tus cuentas</h2>
              <Link href="/transacciones" className="text-sm font-semibold text-accent-strong hover:underline">Ver todas</Link>
            </div>
            <ul className="card max-h-[26rem] divide-y divide-border overflow-y-auto">
              {saldos.map((c) => (
                <li key={c.cuenta_id}>
                  <Link href={`/transacciones/${c.cuenta_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    {c.naturaleza === "credito" ? (
                      <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md text-white" style={{ background: colorDe.get(c.cuenta_id) }}>
                        <CreditCard className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : (
                      <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Building2 className="h-3.5 w-3.5" aria-hidden /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.nombre}</p>
                      <p className="truncate text-xs text-muted">
                        {c.terminacion ? `•••• ${c.terminacion} · ` : ""}{c.ultimo_movimiento ? `último ${fecha(c.ultimo_movimiento)}` : "Sin movimientos"}
                      </p>
                    </div>
                    <p className={`num text-right text-sm font-extrabold ${Number(c.saldo) < 0 ? "text-danger" : "text-primary"}`}>
                      {dinero(c.saldo, c.moneda)}
                    </p>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-label="Resumen de catálogos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map(({ texto, valor, href, icono: Icono, chip }) => (
          <Link key={href} href={href} className="card group flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}><Icono className="h-5 w-5" aria-hidden /></span>
            <span>
              <span className="num block text-2xl font-extrabold text-primary">{valor}</span>
              <span className="block text-xs text-muted">{texto} activos</span>
            </span>
          </Link>
        ))}
      </section>

      {!espacio.principal && (
        <section className="card mt-8 p-6" aria-labelledby="pasos" data-primeros-pasos>
          <h2 id="pasos" className="text-base font-extrabold text-primary">Primeros pasos</h2>
          <ol className="mt-4 space-y-2">
            {pasos.map((p) => (
              <li key={p.href + p.texto}>
                <Link href={p.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2" data-paso={p.listo ? "listo" : "pendiente"}>
                  {p.listo ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-label="Listo" /> : <Circle className="h-5 w-5 shrink-0 text-border" aria-label="Pendiente" />}
                  <span className={p.listo ? "text-muted line-through" : "font-semibold"}>{p.texto}</span>
                  {!p.listo && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden />}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {espacio.principal && <section className="card mt-8 p-6" aria-labelledby="avance">
        <h2 id="avance" className="text-base font-extrabold text-primary">Avance del nuevo Smart Account</h2>
        <ol className="mt-4 space-y-3">
          {FASES.map((f) => (
            <li key={f.n} className="flex items-center gap-3 text-sm">
              {f.estado === "lista"
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-label="Lista" />
                : f.estado === "curso"
                  ? <CircleDot className="h-5 w-5 shrink-0 text-accent-strong" aria-label="En curso" />
                  : <Circle className="h-5 w-5 shrink-0 text-border" aria-label="Pendiente" />}
              <span className={f.estado === "pendiente" ? "text-muted" : "font-semibold"}>Fase {f.n}: {f.texto}</span>
              {f.estado === "curso" && <span className="badge bg-accent-soft text-accent-strong">En curso</span>}
            </li>
          ))}
        </ol>
      </section>}
    </div>
  );
}
