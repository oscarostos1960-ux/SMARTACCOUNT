"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Campo de contraseña con el ojo para mostrarla u ocultarla
export default function InputContrasena(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${props.className ?? "input"} pr-12`} />
      <button type="button" onClick={() => setVisible((v) => !v)} data-ver-contrasena
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-text"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} title={visible ? "Ocultar" : "Mostrar"}>
        {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  );
}
