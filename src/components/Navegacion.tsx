"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home, ArrowLeftRight, FileSearch, CalendarClock, Upload, BarChart3, Landmark, Users, Tag, Tags,
  Building2, Coins, Layers, ShieldCheck, Menu, X, LogOut, Wand2, KeyRound,
} from "lucide-react";
import Logo from "./Logo";

type Item = { href: string; texto: string; icono: React.ElementType; proximamente?: boolean };

const SECCIONES: { titulo?: string; items: Item[]; soloTitular?: boolean }[] = [
  {
    items: [
      { href: "/", texto: "Inicio", icono: Home },
      { href: "/transacciones", texto: "Transacciones", icono: ArrowLeftRight },
      { href: "/reporte", texto: "Reporte de movimientos", icono: FileSearch },
      { href: "/pagos-programados", texto: "Pagos programados", icono: CalendarClock },
      { href: "/importar", texto: "Importar estados de cuenta", icono: Upload },
      { href: "/reportes", texto: "Reportes", icono: BarChart3 },
    ],
  },
  {
    titulo: "Catálogos",
    items: [
      { href: "/catalogos/cuentas", texto: "Cuentas", icono: Landmark },
      { href: "/catalogos/proveedores", texto: "Proveedores", icono: Users },
      { href: "/catalogos/conceptos", texto: "Conceptos", icono: Tag },
      { href: "/catalogos/clasificaciones", texto: "Clasificaciones", icono: Tags },
      { href: "/catalogos/reglas", texto: "Reglas de clasificación", icono: Wand2 },
      { href: "/catalogos/bancos", texto: "Bancos", icono: Building2 },
      { href: "/catalogos/monedas", texto: "Monedas", icono: Coins },
      { href: "/catalogos/tipos-cuenta", texto: "Tipos de cuenta", icono: Layers },
    ],
  },
  { titulo: "Administración", soloTitular: true, items: [{ href: "/usuarios", texto: "Usuarios y permisos", icono: ShieldCheck }] },
];

export default function Navegacion({ nombre, rol }: { nombre: string; rol: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  const menu = (
    <nav aria-label="Principal" className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo claro />
        <div>
          <p className="font-extrabold leading-tight text-nav-text">Smart Account</p>
          <p className="text-xs text-nav-muted">Finanzas personales</p>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {SECCIONES.filter((s) => !s.soloTitular || rol === "titular").map((s, i) => (
          <div key={i}>
            {s.titulo && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-nav-muted">{s.titulo}</p>}
            <ul className="space-y-0.5">
              {s.items.map((it) => {
                const activo = it.href === "/" ? ruta === "/" : ruta === it.href || ruta.startsWith(it.href + "/");
                const Icono = it.icono;
                if (it.proximamente) {
                  return (
                    <li key={it.href}>
                      <span className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-nav-muted/70" title="Próximamente">
                        <Icono className="h-4 w-4" aria-hidden />
                        <span className="flex-1">{it.texto}</span>
                        <span className="badge bg-surface-2 text-[10px] text-muted">Pronto</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setAbierto(false)}
                      aria-current={activo ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        activo ? "bg-nav-activo font-bold text-text" : "text-nav-text hover:bg-white/10"
                      }`}
                    >
                      <Icono className="h-4 w-4" aria-hidden />
                      {it.texto}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/15 px-5 py-4">
        <p className="truncate text-sm font-semibold text-nav-text">{nombre}</p>
        <p className="text-xs capitalize text-nav-muted">{rol === "usuario" ? "Acceso por cuenta" : rol}</p>
        <Link href="/cambiar-contrasena" onClick={() => setAbierto(false)} className="mt-2 inline-flex items-center gap-1.5 text-xs text-nav-muted hover:text-nav-activo">
          <KeyRound className="h-3.5 w-3.5" aria-hidden /> Cambiar contraseña
        </Link>
        <form action="/auth/salir" method="post" className="mt-3">
          <button className="btn w-full border border-white/25 text-nav-text hover:bg-white/10"><LogOut className="h-4 w-4" aria-hidden /> Salir</button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      {/* Barra superior en celular */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-nav px-4 py-3 text-nav-text lg:hidden">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" claro />
          <span className="font-extrabold">Smart Account</span>
        </div>
        <button className="btn p-2 text-nav-text hover:bg-white/10" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}>
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Menú lateral en escritorio */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 bg-nav lg:block">{menu}</aside>

      {/* Menú deslizable en celular */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-nav shadow-xl">
            <button className="btn absolute right-2 top-4 p-2 text-nav-text hover:bg-white/10" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
              <X className="h-5 w-5" aria-hidden />
            </button>
            {menu}
          </aside>
        </div>
      )}
    </>
  );
}
