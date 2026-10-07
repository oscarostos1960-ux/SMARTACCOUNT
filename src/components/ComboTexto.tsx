"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { sinAcentos } from "@/lib/formato";

export type OpcionTexto = { texto: string; detalle?: string };

// Campo de texto libre con una lista de valores usados antes.
// La flecha muestra todas las opciones; al escribir se filtran.
export default function ComboTexto({
  id, nombre, valor, onCambio, onElegir, opciones, maxLength, placeholder,
}: {
  id: string;
  nombre: string;
  valor: string;
  onCambio: (v: string) => void;
  /** Se llama solo cuando se elige una opción de la lista */
  onElegir?: (v: string) => void;
  opciones: OpcionTexto[];
  maxLength?: number;
  placeholder?: string;
}) {
  const listaId = `${useId()}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [filtrar, setFiltrar] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  const q = sinAcentos(valor.trim());
  const visibles = filtrar && q ? opciones.filter((o) => sinAcentos(o.texto).includes(q)) : opciones;
  const hayOpciones = opciones.length > 0;

  function elegir(o: OpcionTexto) {
    onCambio(o.texto);
    onElegir?.(o.texto);
    setAbierto(false);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hayOpciones) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) { setAbierto(true); setFiltrar(false); setActivo(0); }
      else setActivo((a) => Math.min(a + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && abierto && visibles[activo]) {
      e.preventDefault();
      elegir(visibles[activo]);
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
    }
  }

  return (
    <div ref={caja} className="relative"
      onBlur={(e) => { if (!caja.current?.contains(e.relatedTarget as Node)) setAbierto(false); }}>
      <input id={id} name={nombre} type="text" value={valor} maxLength={maxLength} placeholder={placeholder}
        className={`input ${hayOpciones ? "pr-10" : ""}`} autoComplete="off"
        role={hayOpciones ? "combobox" : undefined}
        aria-expanded={hayOpciones ? abierto : undefined}
        aria-controls={hayOpciones ? listaId : undefined}
        aria-autocomplete={hayOpciones ? "list" : undefined}
        onChange={(e) => { onCambio(e.target.value); if (hayOpciones) { setAbierto(true); setFiltrar(true); setActivo(0); } }}
        onKeyDown={teclado} />
      {hayOpciones && (
        <button type="button" tabIndex={-1} data-combo-flecha={nombre}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-text"
          aria-label={`Ver valores usados antes (${opciones.length})`}
          onClick={() => { setAbierto((a) => !a); setFiltrar(false); setActivo(0); }}>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      )}
      {abierto && visibles.length > 0 && (
        <ul id={listaId} role="listbox" data-combo-lista={nombre}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {visibles.map((o, i) => (
            <li key={o.texto} role="option" aria-selected={i === activo}>
              <button type="button" tabIndex={-1}
                className={`block w-full px-3 py-2 text-left text-sm ${i === activo ? "bg-primary-soft" : "hover:bg-primary-soft/60"}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} onMouseEnter={() => setActivo(i)}>
                <span className="block break-words">{o.texto}</span>
                {o.detalle && <span className="block text-xs text-muted">{o.detalle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
