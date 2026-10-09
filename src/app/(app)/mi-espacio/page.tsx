import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerEspacio, obtenerPerfil } from "@/lib/auth";
import { correoConfigurado } from "@/lib/avisos";
import MiEspacioVista from "./MiEspacioVista";

export const metadata: Metadata = { title: "Mi espacio" };

export default async function MiEspacioPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") redirect("/");
  const espacio = await obtenerEspacio();
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Administración</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Mi espacio</h1>
        <p className="mt-1 text-sm text-muted">
          {espacio.principal
            ? "Datos de tu espacio y el correo desde el que salen tus avisos de pago."
            : "Tus datos son solo tuyos. Aquí configuras tu crédito de IA para leer estados de cuenta y el correo desde el que salen tus avisos de pago."}
        </p>
      </header>
      <MiEspacioVista espacio={espacio} correoTitular={perfil.correo} correoGeneral={correoConfigurado()} />
    </div>
  );
}
