import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import FormRecuperar from "./FormRecuperar";

export const metadata: Metadata = { title: "Olvidé mi contraseña" };

export default async function RecuperarPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-nav px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" claro />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Olvidé mi contraseña</h1>
        </div>
        <div className="card border-0 p-6 shadow-xl">
          <FormRecuperar vencida={e === "1"} />
        </div>
        <p className="mt-6 text-center text-sm"><Link href="/login" className="text-nav-muted hover:text-white">← Volver a entrar</Link></p>
      </div>
    </main>
  );
}
