import { obtenerPerfil } from "@/lib/auth";
import Navegacion from "@/components/Navegacion";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const perfil = await obtenerPerfil();

  if (perfil.rol === "pendiente") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Tu acceso está pendiente</h1>
          <p className="mt-2 text-sm text-muted">El titular de la cuenta debe asignarte permisos antes de que puedas ver la información.</p>
          <form action="/auth/salir" method="post" className="mt-6"><button className="btn-secondary">Salir</button></form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <Navegacion nombre={perfil.nombre} rol={perfil.rol} />
      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
