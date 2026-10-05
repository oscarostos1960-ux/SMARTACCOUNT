import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import FormCambio from "./FormCambio";

export const metadata: Metadata = { title: "Cambiar contraseña" };

// Fuera del menú principal: aquí llega quien entra con una contraseña temporal (y cualquiera que quiera cambiarla)
export default async function CambiarContrasenaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const temporal = user.user_metadata?.debe_cambiar === true;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-primary">{temporal ? "Crea tu contraseña" : "Cambiar contraseña"}</h1>
          <p className="mt-1 text-sm text-muted">
            {temporal ? "Entraste con una contraseña temporal. Elige una nueva para seguir." : user.email}
          </p>
        </div>
        <div className="card p-6 shadow-sm">
          <FormCambio />
        </div>
        <div className="mt-6 flex justify-center gap-4 text-xs text-muted">
          {!temporal && <Link href="/" className="hover:text-primary">Volver</Link>}
          <form action="/auth/salir" method="post"><button className="hover:text-primary">Salir</button></form>
        </div>
      </div>
    </main>
  );
}
