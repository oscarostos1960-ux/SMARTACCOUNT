import type { Metadata } from "next";
import FormLogin from "./FormLogin";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-nav px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" claro />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Smart Account</h1>
          <p className="mt-1 text-sm text-nav-muted">Control de finanzas personales</p>
        </div>
        <div className="card border-0 p-6 shadow-xl">
          <FormLogin />
        </div>
        <p className="mt-6 text-center text-xs text-nav-muted">Acceso solo para usuarios autorizados.</p>
      </div>
    </main>
  );
}
