"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Plus, Repeat, Search, Wallet } from "lucide-react";
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

export default function PagosVista({
  vista, mes, hoy, vencimientos, pagos, cuentas, cuentasEditables, esTitular, conceptos, proveedores, clasificaciones,
}: {
  vista: Vista;
  mes: string;
  hoy: string;
  vencimientos: Vencimiento[];
  pagos: PagoProgramado[];
  cuentas: CuentaCorta[];
  cuentasEditables: CuentaCorta[];
  esTitular: boolean;
  conceptos: Opcion[];
  proveedores: Opcion[];
  clasificaciones: Clasif[];
}) {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [version, setVersion] = useState(0);
  const [preparando, setPreparando] = useState<number | null>(null);
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

      {vista === "por-vencer" && (
        <PorVencer hoy={hoy} vencimientos={vencimientos} puedePagar={puedePagar} preparando={preparando}
          onPagar={pagar} onAbrir={(v) => abrir({ tipo: "vencimiento", v })} />
      )}
      {vista === "calendario" && (
        <Calendario mes={mes} hoy={hoy} vencimientos={vencimientos} onAbrir={(v) => abrir({ tipo: "vencimiento", v })} />
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
            aviso={`Pago programado que vence el ${fecha(v.fecha)}. Al guardar, se registra el movimiento y la fecha queda como pagada. Revisa y cambia lo que necesites.`}
            onCerrar={() => setAbierto(null)}
          />
        );
      })()}
    </>
  );
}

// ---------- Por vencer ----------------------------------------------------------
function PorVencer({ hoy, vencimientos, puedePagar, preparando, onPagar, onAbrir }: {
  hoy: string;
  vencimientos: Vencimiento[];
  puedePagar: (v: Vencimiento) => boolean;
  preparando: number | null;
  onPagar: (v: Vencimiento) => void;
  onAbrir: (v: Vencimiento) => void;
}) {
  const pendientes = vencimientos.filter((v) => v.estado === "pendiente");
  const grupos = [
    { id: "vencidos", titulo: "Vencidos", tono: "danger", lista: pendientes.filter((v) => v.fecha < hoy) },
    { id: "semana", titulo: "Próximos 7 días", tono: "warn", lista: pendientes.filter((v) => v.fecha >= hoy && v.fecha <= sumarDias(hoy, 7)) },
    { id: "mes", titulo: "Del día 8 al 30", tono: "primary", lista: pendientes.filter((v) => v.fecha > sumarDias(hoy, 7) && v.fecha <= sumarDias(hoy, 30)) },
    { id: "despues", titulo: "Del día 31 al 90", tono: "muted", lista: pendientes.filter((v) => v.fecha > sumarDias(hoy, 30)) },
  ];
  const [verDespues, setVerDespues] = useState(false);
  const hechos = vencimientos.filter((v) => v.estado !== "pendiente").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const tonos: Record<string, string> = {
    danger: "text-danger", warn: "text-warn", primary: "text-primary", muted: "text-text",
  };

  return (
    <div className="space-y-6">
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
            {g.lista.map((v) => <Fila key={v.id} v={v} hoy={hoy} puedePagar={puedePagar(v)} preparando={preparando === v.id} onPagar={onPagar} onAbrir={onAbrir} />)}
          </ul>
        </details>
      ) : (
        <section key={g.id} id={g.id} aria-labelledby={`t-${g.id}`} className="scroll-mt-4">
          <h2 id={`t-${g.id}`} className={`mb-2 font-semibold ${tonos[g.tono]}`}>{g.titulo}</h2>
          <ul className="card divide-y divide-border">
            {g.lista.map((v) => <Fila key={v.id} v={v} hoy={hoy} puedePagar={puedePagar(v)} preparando={preparando === v.id} onPagar={onPagar} onAbrir={onAbrir} />)}
          </ul>
        </section>
      )))}

      {pendientes.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-medium">No hay pagos pendientes en los próximos 90 días</p>
          <p className="mt-1 text-sm text-muted">Crea uno con “Nuevo pago programado”.</p>
        </div>
      )}

      {hechos.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Pagados u omitidos en los últimos 30 días ({hechos.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {hechos.map((v) => <Fila key={v.id} v={v} hoy={hoy} puedePagar={false} preparando={false} onPagar={onPagar} onAbrir={onAbrir} />)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Fila({ v, hoy, puedePagar, preparando, onPagar, onAbrir }: {
  v: Vencimiento; hoy: string; puedePagar: boolean; preparando: boolean;
  onPagar: (v: Vencimiento) => void; onAbrir: (v: Vencimiento) => void;
}) {
  const dias = diasEntre(hoy, v.fecha);
  const [, m, d] = v.fecha.split("-");
  const mesCorto = fecha(v.fecha).split(" ")[1];
  return (
    <li className="flex items-center gap-3 px-4 py-3">
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
