import type { Metadata } from "next";
import Logo from "@/components/Logo";
import { canjearLiga } from "../actions";

export const metadata: Metadata = { title: "Crear nueva contraseña" };

export default async function ConfirmarPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-nav px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" claro />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Crear nueva contraseña</h1>
        </div>
        <form action={canjearLiga} className="card space-y-4 border-0 p-6 shadow-xl">
          <input type="hidden" name="t" value={t ?? ""} />
          <p className="text-sm">Toca el botón para continuar y elegir tu nueva contraseña.</p>
          <button type="submit" className="btn-primary w-full py-3 text-base">Continuar</button>
        </form>
      </div>
    </main>
  );
}
