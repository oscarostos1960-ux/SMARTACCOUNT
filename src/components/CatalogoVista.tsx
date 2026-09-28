"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Search, X, Check, Ban } from "lucide-react";
import { obtenerCatalogo, type Campo } from "@/lib/catalogos";
import { guardarRegistro, cambiarActivo, type ResultadoGuardar } from "@/app/(app)/catalogos/actions";

export type Registro = Record<string, unknown> & { id: number };
export type Opcion = { valor: string; etiqueta: string };

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function mostrarValor(campo: Campo, valor: unknown, referencias: Record<string, Opcion[]>) {
  if (valor === null || valor === undefined || valor === "") return <span className="text-muted/50">—</span>;
  switch (campo.tipo) {
    case "referencia":
      return referencias[campo.nombre]?.find((o) => o.valor === String(valor))?.etiqueta ?? "—";
    case "opciones":
      return campo.opciones?.find((o) => o.valor === valor)?.etiqueta ?? String(valor);
    case "dinero":
      return <span className="num">{pesos.format(Number(valor))}</span>;
    case "decimal":
      return <span className="num">{Number(valor).toLocaleString("es-MX", { maximumFractionDigits: 6 })}</span>;
    case "terminacion":
      return <span className="num">•••• {String(valor)}</span>;
    case "color":
      return (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border border-border" style={{ background: String(valor) }} />
          <span className="text-xs text-muted">{String(valor)}</span>
        </span>
      );
    case "booleano":
      return valor ? "Sí" : "No";
    default:
      return String(valor);
  }
}

export default function CatalogoVista({
  clave, registros, referencias, puedeEditar,
}: {
  clave: string;
  registros: Registro[];
  referencias: Record<string, Opcion[]>;
  puedeEditar: boolean;
}) {
  const catalogo = obtenerCatalogo(clave)!;
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Registro | "nuevo" | null>(null);
  const columnas = catalogo.campos.filter((c) => c.enTabla);

  const q = busqueda.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const filtrados = registros.filter((r) => {
    if (!verInactivos && r[catalogo.campoActivo] === false) return false;
    if (!q) return true;
    return catalogo.busqueda.some((c) =>
      String(r[c] ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q),
    );
  });

  const inactivos = registros.filter((r) => r[catalogo.campoActivo] === false).length;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar ${catalogo.titulo.toLowerCase()}…`}
            aria-label="Buscar"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          {inactivos > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="accent-[var(--primary)]" />
              Ver inactivos ({inactivos})
            </label>
          )}
          {puedeEditar && (
            <button className="btn-primary" onClick={() => setEditando("nuevo")}>
              <Plus className="h-4 w-4" aria-hidden /> Nuevo {catalogo.singular}
            </button>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">
        {filtrados.length} de {registros.length} {registros.length === 1 ? "registro" : "registros"}
      </p>

      {filtrados.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <p className="font-medium">{registros.length === 0 ? `Aún no hay ${catalogo.titulo.toLowerCase()}` : "Sin resultados"}</p>
          <p className="mt-1 text-sm text-muted">
            {registros.length === 0 && puedeEditar ? `Agrega el primero con “Nuevo ${catalogo.singular}”.` : "Prueba con otra búsqueda."}
          </p>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {columnas.map((c) => (
                    <th key={c.nombre} scope="col" className={`px-4 py-3 font-medium ${c.tipo === "dinero" || c.tipo === "decimal" ? "text-right" : ""}`}>
                      {c.etiqueta}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  {puedeEditar && <th scope="col" className="w-24 px-4 py-3"><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((r) => (
                  <tr key={r.id} className={`hover:bg-surface-2 ${r[catalogo.campoActivo] === false ? "opacity-60" : ""}`}>
                    {columnas.map((c, i) => (
                      <td key={c.nombre} className={`px-4 py-3 ${i === 0 ? "font-medium" : "text-muted"} ${c.tipo === "dinero" || c.tipo === "decimal" ? "text-right" : ""}`}>
                        {mostrarValor(c, r[c.nombre], referencias)}
                      </td>
                    ))}
                    <td className="px-4 py-3"><EstadoBadge activo={r[catalogo.campoActivo] !== false} /></td>
                    {puedeEditar && (
                      <td className="px-4 py-3 text-right">
                        <button className="btn-ghost px-2 py-1" onClick={() => setEditando(r)} aria-label={`Editar ${String(r[columnas[0].nombre])}`}>
                          <Pencil className="h-4 w-4" aria-hidden /> Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {filtrados.map((r) => (
              <li key={r.id} className={`card p-4 ${r[catalogo.campoActivo] === false ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{String(r[columnas[0].nombre] ?? "")}</p>
                    <dl className="mt-1 space-y-0.5 text-sm text-muted">
                      {columnas.slice(1).map((c) =>
                        r[c.nombre] !== null && r[c.nombre] !== "" && r[c.nombre] !== undefined ? (
                          <div key={c.nombre} className="flex gap-1">
                            <dt className="shrink-0">{c.etiqueta}:</dt>
                            <dd className="truncate text-text">{mostrarValor(c, r[c.nombre], referencias)}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <EstadoBadge activo={r[catalogo.campoActivo] !== false} />
                    {puedeEditar && (
                      <button className="btn-secondary px-3 py-1" onClick={() => setEditando(r)}>Editar</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editando && (
        <DialogoEditar
          clave={clave}
          registro={editando === "nuevo" ? null : editando}
          referencias={referencias}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return activo
    ? <span className="badge bg-ok-soft text-ok">Activo</span>
    : <span className="badge bg-surface-2 text-muted">Inactivo</span>;
}

function DialogoEditar({
  clave, registro, referencias, onCerrar,
}: {
  clave: string;
  registro: Registro | null;
  referencias: Record<string, Opcion[]>;
  onCerrar: () => void;
}) {
  const catalogo = obtenerCatalogo(clave)!;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const accion = guardarRegistro.bind(null, clave, registro?.id ?? null);
  const [estado, formAction, guardando] = useActionState<ResultadoGuardar, FormData>(accion, {});
  const [cambiando, startTransition] = useTransition();
  const [errorActivo, setErrorActivo] = useState<string>();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  useEffect(() => {
    if (estado.ok) onCerrar();
  }, [estado.ok, onCerrar]);

  const activo = registro ? registro[catalogo.campoActivo] !== false : true;

  function alternarActivo() {
    if (!registro) return;
    startTransition(async () => {
      try {
        await cambiarActivo(clave, registro.id, !activo);
        onCerrar();
      } catch (e) {
        setErrorActivo(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onCerrar}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
      aria-labelledby="titulo-dialogo"
    >
      <form action={formAction}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="titulo-dialogo" className="text-lg font-semibold">
            {registro ? `Editar ${catalogo.singular}` : `Nuevo ${catalogo.singular}`}
          </h2>
          <button type="button" className="btn-ghost p-1.5" onClick={() => dialogRef.current?.close()} aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {catalogo.campos.map((campo) => (
            <CampoFormulario
              key={campo.nombre}
              campo={campo}
              valor={estado.valores ? estado.valores[campo.nombre] : registro ? registro[campo.nombre] : campo.porDefecto}
              opciones={campo.tipo === "referencia" ? referencias[campo.nombre] : campo.opciones}
              error={estado.errores?.[campo.nombre]}
            />
          ))}
          <input type="hidden" name={catalogo.campoActivo} value={activo ? "on" : ""} />
        </div>

        {(estado.error || errorActivo) && (
          <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorActivo ?? estado.error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {registro && (
              <button type="button" className="btn-ghost" onClick={alternarActivo} disabled={cambiando}>
                {activo ? <><Ban className="h-4 w-4" aria-hidden /> Desactivar</> : <><Check className="h-4 w-4" aria-hidden /> Reactivar</>}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => dialogRef.current?.close()}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

function CampoFormulario({
  campo, valor, opciones, error,
}: {
  campo: Campo;
  valor: unknown;
  opciones?: Opcion[];
  error?: string;
}) {
  const id = `campo-${campo.nombre}`;
  const texto = valor === null || valor === undefined ? "" : String(valor);
  const clases = `input ${error ? "border-danger focus:border-danger focus:ring-danger/20" : ""}`;
  const ancho = campo.ancho === "medio" ? "" : "sm:col-span-2";
  const descr = error ? `${id}-error` : campo.ayuda ? `${id}-ayuda` : undefined;

  if (campo.tipo === "booleano") {
    return (
      <label className={`flex cursor-pointer items-center gap-2 text-sm ${ancho}`}>
        <input type="checkbox" name={campo.nombre} defaultChecked={valor === true || valor === "true"} className="h-4 w-4 accent-[var(--primary)]" />
        {campo.etiqueta}
      </label>
    );
  }

  let control: React.ReactNode;
  const comunes = { id, name: campo.nombre, "aria-invalid": !!error, "aria-describedby": descr, required: campo.requerido };
  switch (campo.tipo) {
    case "textoLargo":
      control = <textarea {...comunes} defaultValue={texto} rows={3} className={clases} />;
      break;
    case "referencia":
    case "opciones":
      control = (
        <select {...comunes} defaultValue={texto} className={clases}>
          {!campo.requerido && <option value="">— Sin especificar —</option>}
          {campo.requerido && !texto && <option value="">Selecciona…</option>}
          {opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      );
      break;
    case "color":
      control = (
        <input {...comunes} type="color" defaultValue={texto || "#1F3A5F"} className="h-10 w-20 cursor-pointer rounded-lg border border-border bg-surface p-1" />
      );
      break;
    case "dinero":
    case "decimal":
      control = <input {...comunes} type="text" inputMode="decimal" defaultValue={texto} className={`${clases} num text-right`} />;
      break;
    case "celular":
    case "terminacion":
      control = <input {...comunes} type="text" inputMode="numeric" defaultValue={texto} maxLength={campo.tipo === "terminacion" ? 4 : 15} className={`${clases} num`} />;
      break;
    case "correo":
      control = <input {...comunes} type="email" defaultValue={texto} className={clases} />;
      break;
    case "rfc":
    case "codigo":
      control = <input {...comunes} type="text" defaultValue={texto} maxLength={campo.tipo === "codigo" ? 3 : 16} className={`${clases} uppercase`} />;
      break;
    default:
      control = <input {...comunes} type="text" defaultValue={texto} className={clases} />;
  }

  return (
    <div className={ancho}>
      <label htmlFor={id} className="label">
        {campo.etiqueta} {campo.requerido && <span className="text-danger" aria-hidden>*</span>}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>
      ) : campo.ayuda ? (
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-muted">{campo.ayuda}</p>
      ) : null}
    </div>
  );
}
