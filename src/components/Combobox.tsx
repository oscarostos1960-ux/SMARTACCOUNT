"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { sinAcentos } from "@/lib/formato";

export type OpcionCombo = { valor: string; etiqueta: string; detalle?: string };

// Lista con buscador para catálogos largos (proveedores, conceptos).
// Envía el valor elegido en un campo oculto con el nombre indicado.
export default function Combobox({
  nombre, opciones, valorInicial, placeholder = "Buscar…", id, invalido, descritoPor, onCambio,
}: {
  nombre: string;
  opciones: OpcionCombo[];
  valorInicial?: string | null;
  placeholder?: string;
  id?: string;
  invalido?: boolean;
  descritoPor?: string;
  onCambio?: (valor: string) => void;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const listaId = `${inputId}-lista`;
  const [valor, setValor] = useState(valorInicial ?? "");
  const elegida = opciones.find((o) => o.valor === valor);
  const [texto, setTexto] = useState(elegida?.etiqueta ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  const filtradas = useMemoFiltro(opciones, texto, elegida?.etiqueta === texto);

  function elegir(o: OpcionCombo | null) {
    setValor(o?.valor ?? "");
    setTexto(o?.etiqueta ?? "");
    setAbierto(false);
    onCambio?.(o?.valor ?? "");
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && abierto) {
      e.preventDefault();
      if (filtradas[activo]) elegir(filtradas[activo]);
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={nombre} value={valor} />
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-invalid={invalido}
        aria-describedby={descritoPor}
        aria-activedescendant={abierto && filtradas[activo] ? `${listaId}-${activo}` : undefined}
        autoComplete="off"
        className={`input pr-16 ${invalido ? "border-danger" : ""}`}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
          if (valor) setValor("");
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => {
          setAbierto(false);
          // Si no se eligió nada de la lista, se limpia el texto suelto.
          setTexto((t) => (opciones.find((o) => o.etiqueta === t) ? t : valor ? t : ""));
        }, 150)}
        onKeyDown={teclado}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {valor && (
          <button type="button" className="rounded p-1 text-muted hover:text-text" onClick={() => elegir(null)} aria-label="Quitar selección">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <ChevronDown className="pointer-events-none h-4 w-4 text-muted" aria-hidden />
      </div>
      {abierto && (
        <ul
          id={listaId}
          ref={lista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Sin coincidencias</li>
          ) : (
            filtradas.map((o, i) => (
              <li
                key={o.valor}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={o.valor === valor}
                className={`cursor-pointer px-3 py-2 text-sm ${i === activo ? "bg-primary-soft text-primary" : "hover:bg-surface-2"}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setActivo(i)}
              >
                {o.etiqueta}
                {o.detalle && <span className="ml-2 text-xs text-muted">{o.detalle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function useMemoFiltro(opciones: OpcionCombo[], texto: string, mostrarTodas: boolean) {
  return useMemo(() => {
    const q = sinAcentos(texto.trim());
    const base = !q || mostrarTodas ? opciones : opciones.filter((o) => sinAcentos(`${o.etiqueta} ${o.detalle ?? ""}`).includes(q));
    return base.slice(0, 100);
  }, [opciones, texto, mostrarTodas]);
}
