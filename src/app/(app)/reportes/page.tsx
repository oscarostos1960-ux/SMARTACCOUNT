import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileSearch, Send } from "lucide-react";

export const metadata: Metadata = { title: "Reportes" };

const REPORTES = [
  { href: "/reportes/comprobantes", titulo: "Comprobantes de pago enviados", texto: "A quién, cuándo y por qué medio (WhatsApp o correo) se envió cada comprobante, y cuáles siguen pendientes.", icono: Send },
  { href: "/reporte", titulo: "Reporte de movimientos", texto: "Busca en una, varias o todas tus cuentas y descárgalo a Excel.", icono: FileSearch },
];

export default function ReportesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-muted">Elige un reporte.</p>
      </header>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="card group flex h-full items-start gap-4 p-5 transition-shadow hover:shadow-md">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><r.icono className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.titulo}</span>
                <span className="mt-1 block text-sm text-muted">{r.texto}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
