"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Filter, ListChecks, Plus, Repeat, Search, Wallet, X } from "lucide-react";
import Combobox from "@/components/Combobox";
import { DialogoMovimiento, type Inicial, type Opcion } from "@/components/movimientos/DialogoMovimiento";
import type { Clasif } from "@/components/movimientos/TablaMovimientos";
import { dinero, dineroClave, fecha, sinAcentos } from "@/lib/formato";
import { describirFrecuencia, diasEntre, moverMes, nombreMes, sumarDias, type PagoProgramado, type Vencimiento } from "@/lib/pagos";
import type { CuentaCorta } from "@/lib/transacciones";
import { siguienteFolioCuenta } from "@/app/(app)/transacciones/actions";
import DialogoPlan from "./DialogoPlan";
import DialogoVencimiento from "./DialogoVencimiento";

export type Vista = "por-vencer" | "calendario" | "pagos";

type Abierto =
  | { tipo: "plan"; pago: PagoProgramado | null }
  | { tipo: "vencimiento"; v: Vencimiento }
  | { tipo: "pagar"; v: Vencimiento; cuenta: CuentaCorta; folio: number };

// Suma importes por moneda: "$12,000.00 · US$300.00"
function totalPorMoneda(lista: Vencimiento[]) {
  const suma = new Map<string, number>();
  for (const v of lista) suma.set(v.moneda, (suma.get(v.moneda) ?? 0) + Number(v.importe) * (v.tipo === "abono" ? -1 : 1));
  if (!suma.size) return dinero(0);
  return [...suma].map(([m, t]) => dineroClave(t, m)).join(" · ");
}

function cuandoTexto(dias: number) {
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  return dias < 0 ? `Hace ${-dias} días` : `En ${dias} días`;
}

export type Filtro = { proveedor: string; concepto: string; soloSeleccionados: boolean };

export default function PagosVista({
  vista, mes, hoy, desde, hasta, vencimientos, pagos, cuentas, cuentasEditables, esTitular, conceptos, proveedores, clasificaciones, abrirNuevo = false,
}: {
  vista: Vista;
  mes: string;
  hoy: string;
  desde: string;
  hasta: string;
  vencimientos: Vencimiento[];
  pagos: PagoProgramado[];
  cuentas: CuentaCorta[];
  cuentasEditables: CuentaCorta[];
  esTitular: boolean;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
  abrirNuevo?: boolean;   // ?nuevo=1: abre directo el alta de un pago programado (acceso rápido del celular)
}) {
  const [abierto, setAbierto] = useState<Abierto | null>(esTitular && abrirNuevo ? { tipo: "plan", pago: null } : null);
  useEffect(() => {
    if (!abrirNuevo) return;
    const u = new URL(window.location.href);
    u.searchParams.delete("nuevo");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [abrirNuevo]);
  const [version, setVersion] = useState(0);
  const [preparando, setPreparando] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>({ proveedor: "", concepto: "", soloSeleccionados: false });
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const filtrados = useMemo(() => vencimientos.filter((v) =>
    (!filtro.proveedor || String(v.proveedor_id) === filtro.proveedor)
    && (!filtro.concepto || String(v.concepto_id) === filtro.concepto)
    && (!filtro.soloSeleccionados || seleccion.has(v.id))), [vencimientos, filtro, seleccion]);
  const alternar = (id: number) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const planes = useMemo(() => new Map(pagos.map((p) => [p.id, p])), [pagos]);
  const editables = useMemo(() => new Set(cuentasEditables.map((c) => c.cuenta_id)), [cuentasEditables]);
  const puedeCambiar = (v: Vencimiento) => esTitular || (v.cuenta_id !== null && editables.has(v.cuenta_id));
  const puedePagar = (v: Vencimiento) => v.estado === "pendiente" && puedeCambiar(v) && cuentasEditables.length > 0;

  function abrir(a: Abierto) {
    setVersion((x) => x + 1);
    setAbierto(a);
  }

  async function pagar(v: Vencimiento) {
    const cuenta = cuentasEditables.find((c) => c.cuenta_id === v.cuenta_id) ?? cuentasEditables[0];
    if (!cuenta) return;
    setPreparando(v.id);
    const folio = await siguienteFolioCuenta(cuenta.cuenta_id);
    setPreparando(null);
    abrir({ tipo: "pagar", v, cuenta, folio });
  }

  const pestañas: { id: Vista; texto: string; icono: React.ElementType }[] = [
    { id: "por-vencer", texto: "Por vencer", icono: ListChecks },
    { id: "calendario", texto: "Calendario", icono: CalendarDays },
    { id: "pagos", texto: `Pagos programados (${pagos.filter((p) => p.activo).length})`, icono: Repeat },
  ];

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Vistas" className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
          {pestañas.map(({ id, texto, icono: Icono }) => (
            <Link key={id} href={id === "por-vencer" ? "/pagos-programados" : `/pagos-programados?vista=${id}${id === "calendario" ? `&mes=${mes}` : ""}`}
              aria-current={vista === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${vista === id ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
              <Icono className="h-4 w-4" aria-hidden /> {texto}
            </Link>
          ))}
        </nav>
        {esTitular && (
          <button className="btn-primary" onClick={() => abrir({ tipo: "plan", pago: null })}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo pago programado
          </button>
        )}
      </div>

      {vista !== "pagos" && (
        <FiltrosPagos vista={vista} vencimientos={vencimientos} filtro={filtro} onFiltro={setFiltro}
          desde={desde} hasta={hasta} mes={mes} seleccionados={seleccion.size} />
      )}
      {vista === "por-vencer" && (
        <PorVencer hoy={hoy} vencimientos={filtrados} puedePagar={puedePagar} preparando={preparando}
          conFiltros={!!(filtro.proveedor || filtro.concepto || filtro.soloSeleccionados || desde || hasta)}
          rango={!!(desde || hasta)} seleccion={seleccion} onSeleccionar={alternar} onSeleccion={setSeleccion}
          onPagar={pagar} onAbrir={(v) => abrir({ tipo: "vencimiento", v })} />
      )}
      {vista === "calendario" && (
        <Calendario mes={mes} hoy={hoy} vencimientos={filtrados} onAbrir={(v) => abrir({ tipo: "vencimiento", v })} />
      )}
      {vista === "pagos" && (
        <Catalogo pagos={pagos} cuentas={cuentas} proveedores={proveedores} conceptos={conceptos} hoy={hoy}
          onAbrir={(p) => abrir({ tipo: "plan", pago: p })} />
      )}

      {abierto?.tipo === "plan" && (
        <DialogoPlan key={version} pago={abierto.pago} cuentas={cuentas} conceptos={conceptos} proveedores={proveedores}
          clasificaciones={clasificaciones} esTitular={esTitular} onCerrar={() => setAbierto(null)} />
      )}
      {abierto?.tipo === "vencimiento" && (
        <DialogoVencimiento key={version} v={abierto.v} plan={planes.get(abierto.v.pago_id)} puedeCambiar={puedeCambiar(abierto.v)}
          onPagar={() => pagar(abierto.v)}
          onVerPlan={() => abrir({ tipo: "plan", pago: planes.get(abierto.v.pago_id) ?? null })}
          onCerrar={() => setAbierto(null)} />
      )}
      {abierto?.tipo === "pagar" && (() => {
        const { v, cuenta, folio } = abierto;
        const plan = planes.get(v.pago_id);
        const inicial: Inicial = {
          proveedor_id: v.proveedor_id ? String(v.proveedor_id) : "",
          tipo: v.tipo,
          monto: Number(v.importe) > 0 ? String(v.importe) : "",
          descripcion: plan?.descripcion ?? v.descripcion ?? "",
          concepto_id: v.concepto_id ? String(v.concepto_id) : "",
          referencia: plan?.referencia ?? "",
          leyenda1: plan?.leyenda1 ?? "",
          leyenda2: plan?.leyenda2 ?? "",
          leyenda3: plan?.leyenda3 ?? "",
          observaciones: plan?.observaciones ?? "",
          clasificaciones: (plan?.clasificaciones ?? []).map(String),
          folio_origen: 0,
          fecha_origen: v.fecha,
          cuenta_origen: cuenta.nombre,
        };
        return (
          <DialogoMovimiento
            key={version}
            cuenta={cuenta}
            cuentas={cuentasEditables}
            movimiento={null}
            siguienteFolio={folio}
            conceptos={conceptos}
            proveedores={proveedores}
            clasificaciones={clasificaciones}
            puedeEditar
            inicial={inicial}
            vencimientoId={v.id}
            titulo="Registrar pago"
            avisoPrevio={plan && (plan.avisar_whatsapp || plan.avisar_correo)
              ? `Al guardar se enviará el aviso de pago por ${[plan.avisar_whatsapp && "WhatsApp", plan.avisar_correo && "correo"].filter(Boolean).join(" y ")} a ${v.proveedor ?? "el proveedor"}, con los documentos que adjuntes.`
              : undefined}
            aviso={`Pago programado que vence el ${fecha(v.fecha)}. Al guardar, se registra el movimiento y la fecha queda como pagada. Revisa y cambia lo que necesites.`}
            onCerrar={() => setAbierto(null)}
          />
        );
      })()}
    </>
  );
}

// ---------- Por vencer ----------------------------------------------------------
function PorVencer({ hoy, vencimientos, puedePagar, preparando, conFiltros, rango, seleccion, onSeleccionar, onSeleccion, onPagar, onAbrir }: {
  hoy: string;
  vencimientos: Vencimiento[];
  puedePagar: (v: Vencimiento) => boolean;
  preparando: number | null;
  conFiltros: boolean;
  rango: boolean;
  seleccion: Set<number>;
  onSeleccionar: (id: number) => void;
  onSeleccion: (s: Set<number>) => void;
  onPagar: (v: Vencimiento) => void;
  onAbrir: (v: Vencimiento) => void;
}) {
  const pendientes = vencimientos.filter((v) => v.estado === "pendiente");
  const grupos = [
    { id: "vencidos", titulo: "Vencidos", tono: "danger", lista: pendientes.filter((v) => v.fecha < hoy) },
    { id: "semana", titulo: "Próximos 7 días", tono: "warn", lista: pendientes.filter((v) => v.fecha >= hoy && v.fecha <= sumarDias(hoy, 7)) },
    { id: "mes", titulo: "Del día 8 al 30", tono: "primary", lista: pendientes.filter((v) => v.fecha > sumarDias(hoy, 7) && v.fecha <= sumarDias(hoy, 30)) },
    { id: "despues", titulo: rango ? "Del día 31 en adelante" : "Del día 31 al 90", tono: "muted", lista: pendientes.filter((v) => v.fecha > sumarDias(hoy, 30)) },
  ];
  const [verDespuesManual, setVerDespues] = useState<boolean | null>(null);
  const verDespues = verDespuesManual ?? conFiltros;
  const hechos = vencimientos.filter((v) => v.estado !== "pendiente").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const elegidos = vencimientos.filter((v) => seleccion.has(v.id));
  const todosElegidos = pendientes.length > 0 && pendientes.every((v) => seleccion.has(v.id));
  const fila = (v: Vencimiento, pagable: boolean) => (
    <Fila key={v.id} v={v} hoy={hoy} puedePagar={pagable && puedePagar(v)} preparando={preparando === v.id}
      seleccionado={seleccion.has(v.id)} onSeleccionar={onSeleccionar} onPagar={onPagar} onAbrir={onAbrir} />
  );
  const tonos: Record<string, string> = {
    danger: "text-danger", warn: "text-warn", primary: "text-primary", muted: "text-text",
  };

  return (
    <div className="space-y-6">
      <section aria-label="Totales" className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="text-muted">{conFiltros ? "Total de lo filtrado" : "Total por pagar"} · {pendientes.length} {pendientes.length === 1 ? "pago pendiente" : "pagos pendientes"}</p>
          <p className="num text-2xl font-semibold" data-total-filtrado>{totalPorMoneda(pendientes)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {elegidos.length > 0 && (
            <p className="text-sm">
              <span className="font-medium text-primary">{elegidos.length} seleccionado{elegidos.length > 1 ? "s" : ""}</span>
              {" · "}<span className="num font-semibold" data-total-seleccion>{totalPorMoneda(elegidos)}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pendientes.length > 0 && (
              <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => {
                const n = new Set(seleccion);
                for (const v of pendientes) { if (todosElegidos) n.delete(v.id); else n.add(v.id); }
                onSeleccion(n);
              }}>
                <CheckSquare className="h-4 w-4" aria-hidden /> {todosElegidos ? "Quitar los mostrados" : "Seleccionar los mostrados"}
              </button>
            )}
            {seleccion.size > 0 && (
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => onSeleccion(new Set())}>Quitar selección</button>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {grupos.map((g) => (
          <a key={g.id} href={`#${g.id}`} onClick={() => { if (g.id === "despues") setVerDespues(true); }} className="card p-4 hover:shadow-md">
            <p className="text-sm text-muted">{g.titulo}</p>
            <p className={`num mt-1 text-xl font-semibold ${tonos[g.tono]}`}>{totalPorMoneda(g.lista)}</p>
            <p className="text-xs text-muted">{g.lista.length} {g.lista.length === 1 ? "pago" : "pagos"}</p>
          </a>
        ))}
      </section>

      {grupos.map((g) => g.lista.length > 0 && (g.id === "despues" ? (
        <details key={g.id} id={g.id} className="card scroll-mt-4" open={verDespues} onToggle={(e) => setVerDespues(e.currentTarget.open)}>
          <summary className="cursor-pointer px-5 py-3 font-semibold">{g.titulo} ({g.lista.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {g.lista.map((v) => fila(v, true))}
          </ul>
        </details>
      ) : (
        <section key={g.id} id={g.id} aria-labelledby={`t-${g.id}`} className="scroll-mt-4">
          <h2 id={`t-${g.id}`} className={`mb-2 font-semibold ${tonos[g.tono]}`}>{g.titulo}</h2>
          <ul className="card divide-y divide-border">
            {g.lista.map((v) => fila(v, true))}
          </ul>
        </section>
      )))}

      {pendientes.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-medium">{conFiltros ? "Ningún pago pendiente coincide con los filtros" : "No hay pagos pendientes en los próximos 90 días"}</p>
          <p className="mt-1 text-sm text-muted">{conFiltros ? "Cambia o limpia los filtros." : "Crea uno con “Nuevo pago programado”."}</p>
        </div>
      )}

      {hechos.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{rango ? "Pagados u omitidos en el periodo" : "Pagados u omitidos en los últimos 30 días"} ({hechos.length}) · <span className="num">{totalPorMoneda(hechos.filter((v) => v.estado === "pagado"))}</span> pagado</summary>
          <ul className="divide-y divide-border border-t border-border">
            {hechos.map((v) => fila(v, false))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Fila({ v, hoy, puedePagar, preparando, seleccionado, onSeleccionar, onPagar, onAbrir }: {
  v: Vencimiento; hoy: string; puedePagar: boolean; preparando: boolean; seleccionado: boolean;
  onSeleccionar: (id: number) => void; onPagar: (v: Vencimiento) => void; onAbrir: (v: Vencimiento) => void;
}) {
  const dias = diasEntre(hoy, v.fecha);
  const [, m, d] = v.fecha.split("-");
  const mesCorto = fecha(v.fecha).split(" ")[1];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${seleccionado ? "bg-primary-soft/60" : ""}`}>
      <input type="checkbox" checked={seleccionado} onChange={() => onSeleccionar(v.id)} className="h-4 w-4 shrink-0 accent-[var(--primary)]"
        aria-label={`Seleccionar ${v.proveedor ?? v.descripcion}, ${fecha(v.fecha)}`} />
      <button type="button" onClick={() => onAbrir(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${v.proveedor ?? v.descripcion}, ${fecha(v.fecha)}`}>
        <span className={`flex w-12 shrink-0 flex-col items-center rounded-lg border py-1 ${v.estado === "pendiente" && dias < 0 ? "border-danger text-danger" : "border-border"}`} data-mes={m}>
          <span className="num text-lg font-semibold leading-none">{Number(d)}</span>
          <span className="text-xs uppercase text-muted">{mesCorto}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{v.proveedor ?? v.concepto ?? v.descripcion}</span>
          <span className="block truncate text-xs text-muted">
            {[v.concepto, v.cuenta, v.notas].filter(Boolean).join(" · ") || v.descripcion}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`num block text-sm font-semibold ${v.tipo === "abono" ? "text-ok" : ""}`}>
            {Number(v.importe) > 0 ? dineroClave(v.importe, v.moneda) : <span className="font-normal text-muted">Variable</span>}
          </span>
          <span className={`block text-xs ${v.estado === "pagado" ? "text-ok" : v.estado === "omitido" ? "text-muted" : dias < 0 ? "text-danger" : "text-muted"}`}>
            {v.estado === "pagado" ? `Pagado${v.folio != null ? ` · folio ${v.folio}` : ""}` : v.estado === "omitido" ? "Omitido" : cuandoTexto(dias)}
          </span>
        </span>
      </button>
      {puedePagar && (
        <button type="button" className="btn-secondary shrink-0 px-3 py-1.5" onClick={() => onPagar(v)} disabled={preparando}>
          <Wallet className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{preparando ? "Abriendo…" : "Pagar"}</span>
        </button>
      )}
    </li>
  );
}

// ---------- Calendario ------------------------------------------------------------
function Calendario({ mes, hoy, vencimientos, onAbrir }: {
  mes: string; hoy: string; vencimientos: Vencimiento[]; onAbrir: (v: Vencimiento) => void;
}) {
  const primero = `${mes}-01`;
  const desfase = (new Date(`${primero}T12:00:00Z`).getUTCDay() + 6) % 7;   // lunes = 0
  const diasMes = diasEntre(primero, `${moverMes(mes, 1)}-01`);
  const porDia = new Map<string, Vencimiento[]>();
  for (const v of vencimientos) porDia.set(v.fecha, [...(porDia.get(v.fecha) ?? []), v]);
  const celdas = [...Array(desfase).fill(null), ...Array.from({ length: diasMes }, (_, i) => sumarDias(primero, i))];
  while (celdas.length % 7) celdas.push(null);
  const pendientes = vencimientos.filter((v) => v.estado === "pendiente");
  const pagados = vencimientos.filter((v) => v.estado === "pagado");

  const chip = (v: Vencimiento) => {
    const clase = v.estado === "pagado" ? "bg-ok-soft text-ok" : v.estado === "omitido" ? "bg-surface-2 text-muted line-through"
      : v.fecha < hoy ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn";
    return (
      <button key={v.id} type="button" onClick={() => onAbrir(v)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${clase}`}
        title={`${v.proveedor ?? v.descripcion} · ${Number(v.importe) > 0 ? dineroClave(v.importe, v.moneda) : "variable"}`}>
        {v.proveedor ?? v.concepto ?? v.descripcion}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/pagos-programados?vista=calendario&mes=${moverMes(mes, -1)}`} className="btn-secondary px-2" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" aria-hidden /></Link>
          <h2 className="min-w-40 text-center text-lg font-semibold">{nombreMes(mes)}</h2>
          <Link href={`/pagos-programados?vista=calendario&mes=${moverMes(mes, 1)}`} className="btn-secondary px-2" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" aria-hidden /></Link>
          {mes !== hoy.slice(0, 7) && <Link href="/pagos-programados?vista=calendario" className="btn-ghost">Hoy</Link>}
        </div>
        <p className="text-sm text-muted">
          Pendiente: <span className="num font-semibold text-text">{totalPorMoneda(pendientes)}</span>
          {" · "}Pagado: <span className="num font-semibold text-ok">{totalPorMoneda(pagados)}</span>
        </p>
      </div>

      {/* Cuadrícula (pantallas medianas en adelante) */}
      <div className="card hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-medium text-muted">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {celdas.map((dia, i) => {
            const lista = dia ? porDia.get(dia) ?? [] : [];
            return (
              <div key={i} className={`min-h-28 border-b border-r border-border p-1.5 ${!dia ? "bg-surface-2/50" : ""}`}>
                {dia && (
                  <>
                    <p className={`mb-1 text-xs ${dia === hoy ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-white" : "text-muted"}`}>{Number(dia.slice(8))}</p>
                    <div className="space-y-0.5">
                      {lista.slice(0, 4).map(chip)}
                      {lista.length > 4 && <DiaMas lista={lista.slice(4)} chip={chip} />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista por día (celular) */}
      <ul className="card divide-y divide-border md:hidden">
        {[...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([dia, lista]) => (
          <li key={dia} className="px-4 py-3">
            <p className={`mb-1.5 text-sm font-medium ${dia === hoy ? "text-primary" : ""}`}>{fecha(dia)}</p>
            <div className="space-y-1">{lista.map(chip)}</div>
          </li>
        ))}
        {porDia.size === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Sin pagos este mes.</li>}
      </ul>
    </div>
  );
}

function DiaMas({ lista, chip }: { lista: Vencimiento[]; chip: (v: Vencimiento) => React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  if (abierto) return <>{lista.map(chip)}</>;
  return <button type="button" className="px-1.5 text-xs font-medium text-primary hover:underline" onClick={() => setAbierto(true)}>+{lista.length} más</button>;
}

// ---------- Catálogo de pagos programados -----------------------------------------------
function Catalogo({ pagos, cuentas, proveedores, conceptos, hoy, onAbrir }: {
  pagos: PagoProgramado[]; cuentas: CuentaCorta[]; proveedores: Opcion[]; conceptos: Opcion[]; hoy: string;
  onAbrir: (p: PagoProgramado) => void;
}) {
  const [texto, setTexto] = useState("");
  const [verPausados, setVerPausados] = useState(false);
  const nombreProv = useMemo(() => new Map(proveedores.map((p) => [p.valor, p.etiqueta])), [proveedores]);
  const nombreConc = useMemo(() => new Map(conceptos.map((c) => [c.valor, c.etiqueta])), [conceptos]);
  const nombreCuenta = useMemo(() => new Map(cuentas.map((c) => [c.cuenta_id, c])), [cuentas]);

  const filas = pagos
    .map((p) => ({
      p,
      proveedor: nombreProv.get(String(p.proveedor_id)) ?? "",
      concepto: nombreConc.get(String(p.concepto_id)) ?? "",
      cuenta: p.cuenta_id ? nombreCuenta.get(p.cuenta_id) : undefined,
    }))
    .filter((f) => verPausados || f.p.activo)
    .filter((f) => !texto || sinAcentos(`${f.proveedor} ${f.concepto} ${f.p.descripcion} ${f.p.leyenda1 ?? ""}`).includes(sinAcentos(texto)))
    .sort((a, b) => (a.p.proximo ?? "9999").localeCompare(b.p.proximo ?? "9999") || a.proveedor.localeCompare(b.proveedor, "es"));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar proveedor, concepto o leyenda…" className="input pl-9" aria-label="Buscar" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={verPausados} onChange={(e) => setVerPausados(e.target.checked)} /> Mostrar pausados
        </label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">A favor de</th>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Frecuencia</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
              <th className="px-4 py-2 font-medium">Cuenta</th>
              <th className="px-4 py-2 font-medium">Próximo pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map(({ p, proveedor, concepto, cuenta }) => {
              const importe = Math.max(p.cargo, p.abono);
              return (
                <tr key={p.id} className={`cursor-pointer hover:bg-surface-2 ${!p.activo ? "text-muted" : ""}`} onClick={() => onAbrir(p)}>
                  <td className="px-4 py-2.5">
                    <button type="button" className="text-left font-medium hover:text-primary" onClick={(e) => { e.stopPropagation(); onAbrir(p); }}>
                      {proveedor || p.descripcion || "—"}
                    </button>
                    {!p.activo && <span className="badge ml-2 bg-surface-2 text-muted">Pausado</span>}
                  </td>
                  <td className="max-w-[16rem] px-4 py-2.5">{concepto || "—"}</td>
                  <td className="px-4 py-2.5">{describirFrecuencia(p)}{p.fecha_fin ? <span className="block text-xs text-muted">hasta {fecha(p.fecha_fin)}</span> : null}</td>
                  <td className={`num px-4 py-2.5 text-right ${p.abono > p.cargo ? "text-ok" : ""}`}>
                    {importe > 0 ? dineroClave(importe, cuenta?.moneda ?? "MXN") : <span className="text-muted">Variable</span>}
                    {p.cargo > 0 && p.abono > 0 && <span className="block text-xs text-warn">cargo y abono</span>}
                  </td>
                  <td className="px-4 py-2.5">{cuenta?.nombre ?? <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {p.proximo ? fecha(p.proximo) : <span className="text-muted">—</span>}
                    {p.pendientes > 0 && <span className="block text-xs text-danger">{p.pendientes} vencido{p.pendientes > 1 ? "s" : ""}</span>}
                    {p.proximo && diasEntre(hoy, p.proximo) <= 7 && <span className="block text-xs text-warn">{cuandoTexto(diasEntre(hoy, p.proximo))}</span>}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{texto ? "Ningún pago coincide con la búsqueda." : "Aún no hay pagos programados."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Filtros ----------------------------------------------------------------
function FiltrosPagos({ vista, vencimientos, filtro, onFiltro, desde, hasta, mes, seleccionados }: {
  vista: Vista; vencimientos: Vencimiento[]; filtro: Filtro; onFiltro: (f: Filtro) => void;
  desde: string; hasta: string; mes: string; seleccionados: number;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  // Solo proveedores y conceptos que aparecen en las fechas cargadas
  const opciones = (clave: "proveedor" | "concepto") => {
    const m = new Map<string, string>();
    for (const v of vencimientos) {
      const id = v[`${clave}_id`];
      if (id != null && v[clave]) m.set(String(id), v[clave]!);
    }
    return [...m].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  };
  function irFechas(d: string, h: string) {
    const q = new URLSearchParams();
    if (d) q.set("desde", d);
    if (h) q.set("hasta", h);
    router.replace(`/pagos-programados${q.size ? `?${q}` : ""}`, { scroll: false });
  }
  const hayFiltros = !!(filtro.proveedor || filtro.concepto || filtro.soloSeleccionados || desde || hasta);
  function limpiar() {
    onFiltro({ proveedor: "", concepto: "", soloSeleccionados: false });
    setVersion((x) => x + 1);
    if (desde || hasta) irFechas("", "");
  }

  return (
    <section aria-label="Filtros" className="card mb-5 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-4">
          <label htmlFor="f-proveedor" className="label">A favor de</label>
          <Combobox key={`p${version}`} id="f-proveedor" nombre="f_proveedor" opciones={opciones("proveedor")} valorInicial={filtro.proveedor}
            placeholder="Todos" onCambio={(valor) => onFiltro({ ...filtro, proveedor: valor })} />
        </div>
        <div className="lg:col-span-3">
          <label htmlFor="f-concepto" className="label">Concepto</label>
          <Combobox key={`c${version}`} id="f-concepto" nombre="f_concepto" opciones={opciones("concepto")} valorInicial={filtro.concepto}
            placeholder="Todos" onCambio={(valor) => onFiltro({ ...filtro, concepto: valor })} />
        </div>
        {vista === "por-vencer" ? (
          <>
            <div className="lg:col-span-2">
              <label htmlFor="f-desde" className="label">Desde</label>
              <input key={`d${desde}`} id="f-desde" type="date" defaultValue={desde} className="input"
                onChange={(e) => { if (!e.target.value || e.target.value.length === 10) irFechas(e.target.value, hasta); }} />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="f-hasta" className="label">Hasta</label>
              <input key={`h${hasta}`} id="f-hasta" type="date" defaultValue={hasta} className="input"
                onChange={(e) => { if (!e.target.value || e.target.value.length === 10) irFechas(desde, e.target.value); }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted lg:col-span-4">Mostrando {nombreMes(mes)}.</p>
        )}
        <div className="flex items-center gap-3 lg:col-span-1 lg:justify-end">
          {hayFiltros && (
            <button type="button" className="btn-ghost px-2 py-2" onClick={limpiar} title="Limpiar filtros" aria-label="Limpiar filtros">
              <X className="h-4 w-4" aria-hidden /> <span className="lg:sr-only">Limpiar</span>
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filtro.soloSeleccionados} onChange={(e) => onFiltro({ ...filtro, soloSeleccionados: e.target.checked })}
            className="h-4 w-4 accent-[var(--primary)]" />
          Solo seleccionados {seleccionados > 0 && <span className="badge bg-primary-soft text-primary">{seleccionados}</span>}
        </label>
        {vista === "por-vencer" && !desde && !hasta && (
          <span className="flex items-center gap-1.5 text-muted"><Filter className="h-3.5 w-3.5" aria-hidden /> Sin fechas: pendientes hasta 90 días y lo pagado en los últimos 30.</span>
        )}
      </div>
    </section>
  );
}
