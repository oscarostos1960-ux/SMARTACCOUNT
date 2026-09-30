"use client";

import { useCallback, useSyncExternalStore } from "react";
import { leerColumnas, type ClaveColumna } from "@/lib/transacciones";

// Columnas elegidas por el usuario, guardadas en este navegador.
const oyentes = new Set<() => void>();

function leer(clave: string) {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function useColumnas(clave: string, porDefecto: ClaveColumna[]) {
  const texto = useSyncExternalStore(
    (cb) => {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
    () => leer(clave),
    () => null,
  );
  const columnas = leerColumnas(texto, porDefecto);
  const guardar = useCallback(
    (nuevas: ClaveColumna[]) => {
      try {
        window.localStorage.setItem(clave, nuevas.join(","));
      } catch {
        /* sin almacenamiento: solo dura esta visita */
      }
      oyentes.forEach((cb) => cb());
    },
    [clave],
  );
  return [columnas, guardar] as const;
}
