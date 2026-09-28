import type { Metadata } from "next";
import FormLogin from "./FormLogin";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-primary">Smart Account</h1>
          <p className="mt-1 text-sm text-muted">Control de finanzas personales</p>
        </div>
        <div className="card p-6 shadow-sm">
          <FormLogin />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Acceso solo para usuarios autorizados.</p>
      </div>
    </main>
  );
}
