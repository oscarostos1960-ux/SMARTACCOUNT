import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esAdmin, obtenerPerfil, type Perfil } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fecha } from "@/lib/formato";
import ClientesVista, { type Cliente } from "./ClientesVista";
import type { CuentaCorta } from "@/lib/transacciones";
import UsuariosVista, { type Permiso } from "./UsuariosVista";

export const metadata: Metadata = { title: "Usuarios y permisos" };

export default async function UsuariosPage() {
  const perfil = await obtenerPerfil();
  if (perfil.rol !== "titular") redirect("/");
  const supabase = await createClient();
  const [usuariosR, cuentasR, permisosR] = await Promise.all([
    supabase.from("perfiles").select("id,nombre,correo,rol").order("nombre"),
    supabase.from("v_saldos_cuentas").select("cuenta_id, nombre, moneda, activa").order("nombre"),
    supabase.from("permisos_cuenta").select("usuario_id, cuenta_id, nivel"),
  ]);

  const clientes = (await esAdmin()) ? await cargarClientes() : null;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Administración</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-muted">
          <strong>Titular</strong>: control total. <strong>Acceso por cuenta</strong>: solo ve las cuentas que le asignes,
          y en cada una puede solo consultar o también capturar. <strong>Sin acceso</strong>: no ve nada.
        </p>
      </header>
      <UsuariosVista
        usuarios={(usuariosR.data ?? []) as Perfil[]}
        cuentas={(cuentasR.data ?? []) as CuentaCorta[]}
        permisos={(permisosR.data ?? []) as Permiso[]}
        yo={perfil.id}
      />
      </div>
      {clientes && <ClientesVista clientes={clientes} />}
    </div>
  );
}

// Lista de clientes (solo datos generales: nunca sus movimientos). Se lee con la llave de servicio.
async function cargarClientes(): Promise<Cliente[]> {
  let admin;
  try { admin = createAdminClient(); } catch { return []; }
  const [espR, perR, cueR] = await Promise.all([
    admin.from("espacios").select("id, nombre, titular_id, smtp_activo, ia_clave_fin, created_at").eq("principal", false).order("created_at"),
    admin.from("perfiles").select("id, nombre, correo, espacio_id"),
    admin.from("cuentas").select("espacio_id"),
  ]);
  const perfiles = perR.data ?? [];
  return (espR.data ?? []).map((e) => {
    const tit = perfiles.find((p) => p.id === e.titular_id);
    return {
      id: Number(e.id), nombre: e.nombre, titular: tit?.nombre ?? null, correo: tit?.correo ?? null,
      creado: fecha(String(e.created_at).slice(0, 10)),
      usuarios: perfiles.filter((p) => Number(p.espacio_id) === Number(e.id)).length,
      cuentas: (cueR.data ?? []).filter((c) => Number(c.espacio_id) === Number(e.id)).length,
      ia: !!e.ia_clave_fin, correoPropio: !!e.smtp_activo,
    };
  });
}
