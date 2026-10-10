"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin, exigirTitular } from "@/lib/auth";

export type Resultado = { ok?: string; error?: string; contrasena?: string };
const ROLES = ["titular", "usuario", "pendiente"];

export async function cambiarRol(id: string, rol: string): Promise<Resultado> {
  await exigirTitular();
  if (!ROLES.includes(rol)) return { error: "Rol no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ rol }).eq("id", id);
  if (error) return { error: error.message.includes("titular") ? error.message : "No se pudo cambiar el rol." };
  revalidatePath("/usuarios");
  return { ok: "Rol actualizado." };
}

// nivel: "ver" | "editar" | "" (sin acceso)
export async function cambiarPermiso(usuarioId: string, cuentaIds: number[], nivel: string): Promise<Resultado> {
  await exigirTitular();
  if (!["ver", "editar", ""].includes(nivel)) return { error: "Permiso no válido." };
  const ids = cuentaIds.filter((c) => Number.isInteger(c) && c > 0);
  if (!ids.length) return {};
  const supabase = await createClient();
  const { error } = nivel
    ? await supabase.from("permisos_cuenta").upsert(ids.map((c) => ({ usuario_id: usuarioId, cuenta_id: c, nivel })))
    : await supabase.from("permisos_cuenta").delete().eq("usuario_id", usuarioId).in("cuenta_id", ids);
  if (error) return { error: "No se pudo guardar el permiso." };
  revalidatePath("/usuarios");
  return { ok: "Permisos guardados." };
}

// Contraseña temporal fácil de dictar o mandar por WhatsApp (sin letras que se confunden: 0/O, 1/l/I)
function contrasenaTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz", digitos = "23456789";
  const al = (t: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => t[v % t.length]).join("");
  return `Smart-${al(digitos, 4)}-${al(letras, 4)}`;
}

// Alta de un usuario con contraseña temporal: al entrar la primera vez, la app le pide cambiarla.
export async function crearUsuario(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const yo = await exigirTitular();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "usuario");
  const escrita = String(formData.get("contrasena") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Correo no válido." };
  if (!["titular", "usuario"].includes(rol)) return { error: "Rol no válido." };
  if (escrita && escrita.length < 8) return { error: "La contraseña temporal debe tener al menos 8 caracteres (o déjala vacía y se genera una)." };
  const contrasena = escrita || contrasenaTemporal();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Falta activar el alta de usuarios: agrega SUPABASE_SERVICE_ROLE_KEY en las variables de Vercel." };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre: nombre || correo, debe_cambiar: true },
    app_metadata: { espacio_id: yo.espacio_id },   // trabaja con los datos del mismo espacio
  });
  if (error || !data.user) {
    return { error: /already|exists|registered/i.test(error?.message ?? "") ? "Ya existe un usuario con ese correo." : `No se pudo crear el usuario (${error?.message ?? "sin respuesta"}).` };
  }
  // El trigger lo crea como "pendiente" (y sin saber su espacio): se le asignan espacio, rol y nombre
  const { error: e2 } = await admin.from("perfiles")
    .update({ espacio_id: yo.espacio_id, rol, ...(nombre ? { nombre } : {}) }).eq("id", data.user.id);
  if (e2) return { error: `Se creó el usuario pero no se pudo asignar su permiso (${e2.message}).` };
  revalidatePath("/usuarios");
  return {
    ok: `Usuario creado. Mándale estos datos: entra a smartaccount2026.vercel.app con ${correo} y la contraseña temporal ${contrasena}. Al entrar le pedirá cambiarla.${rol === "usuario" ? " Ahora elige a qué cuentas tendrá acceso." : ""}`,
    contrasena,
  };
}

// Solo se administra a usuarios del mismo espacio (la llave de servicio no tiene candados propios)
async function delMismoEspacio(admin: ReturnType<typeof createAdminClient>, usuarioId: string, espacioId: number) {
  const { data } = await admin.from("perfiles").select("nombre, rol, espacio_id").eq("id", usuarioId).maybeSingle();
  return data && Number(data.espacio_id) === espacioId ? data as { nombre: string; rol: string; espacio_id: number } : null;
}

// Nueva contraseña temporal para alguien que la olvidó
export async function restablecerContrasena(usuarioId: string): Promise<Resultado> {
  const yo = await exigirTitular();
  if (usuarioId === yo.id) return { error: "Tu propia contraseña cámbiala en \"Cambiar contraseña\"." };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "Falta activar el alta de usuarios: agrega SUPABASE_SERVICE_ROLE_KEY en las variables de Vercel." }; }
  if (!(await delMismoEspacio(admin, usuarioId, yo.espacio_id))) return { error: "No se encontró el usuario." };
  const contrasena = contrasenaTemporal();
  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: contrasena, user_metadata: { debe_cambiar: true } });
  if (error) return { error: `No se pudo restablecer (${error.message}).` };
  return { ok: `Nueva contraseña temporal: ${contrasena}. Al entrar le pedirá cambiarla.`, contrasena };
}

// Eliminar un usuario: pierde el acceso de inmediato. Sus movimientos capturados se quedan (sin autor);
// sus lecturas de estados de cuenta pasan al titular para no perder el historial de importaciones.
export async function eliminarUsuario(usuarioId: string): Promise<Resultado> {
  const yo = await exigirTitular();
  if (usuarioId === yo.id) return { error: "No puedes eliminarte a ti mismo." };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "Falta activar el alta de usuarios: agrega SUPABASE_SERVICE_ROLE_KEY en las variables de Vercel." }; }
  const perfil = await delMismoEspacio(admin, usuarioId, yo.espacio_id);
  if (!perfil) return { error: "No se encontró el usuario." };
  if (perfil.rol === "titular") {
    const { count } = await admin.from("perfiles").select("id", { count: "exact", head: true }).eq("rol", "titular").eq("espacio_id", yo.espacio_id);
    if ((count ?? 0) <= 1) return { error: "Debe quedar al menos un titular." };
  }
  const { error: e1 } = await admin.from("importaciones").update({ usuario_id: yo.id }).eq("usuario_id", usuarioId);
  if (e1) return { error: `No se pudo eliminar (${e1.message}).` };
  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) return { error: `No se pudo eliminar (${error.message}).` };
  revalidatePath("/usuarios");
  return { ok: `Se eliminó a ${perfil.nombre}. Ya no puede entrar; lo que capturó se conserva.` };
}

// ---------- Clientes con espacio propio (solo el administrador general) ----------
// Crea un espacio en blanco y a su titular. El cliente da de alta sus bancos, cuentas, proveedores, etc.,
// usa su propia clave de IA y puede configurar su propio correo para los avisos.
export async function crearCliente(_prev: Resultado, formData: FormData): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el administrador puede crear clientes." };
  const espacioNombre = String(formData.get("espacio") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const escrita = String(formData.get("contrasena") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Correo no válido." };
  if (escrita && escrita.length < 8) return { error: "La contraseña temporal debe tener al menos 8 caracteres (o déjala vacía y se genera una)." };
  const contrasena = escrita || contrasenaTemporal();
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "Falta activar el alta de usuarios: agrega SUPABASE_SERVICE_ROLE_KEY en las variables de Vercel." }; }

  const { data: esp, error: e1 } = await admin.from("espacios")
    .insert({ nombre: (espacioNombre || nombre || correo).slice(0, 120), correo_nombre: (nombre || espacioNombre || null)?.slice(0, 120) ?? null })
    .select("id").single();
  if (e1 || !esp) return { error: `No se pudo crear el espacio (${e1?.message ?? "sin respuesta"}).` };
  const { data, error } = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre: nombre || correo, debe_cambiar: true },
    app_metadata: { espacio_id: Number(esp.id), rol: "titular" },
  });
  if (error || !data.user) {
    await admin.from("espacios").delete().eq("id", esp.id);
    return { error: /already|exists|registered/i.test(error?.message ?? "") ? "Ya existe un usuario con ese correo." : `No se pudo crear el usuario (${error?.message ?? "sin respuesta"}).` };
  }
  await admin.from("espacios").update({ titular_id: data.user.id }).eq("id", esp.id);
  // Supabase guarda app_metadata después de crear el perfil: el espacio y el rol se asignan aquí
  const { error: e2 } = await admin.from("perfiles")
    .update({ espacio_id: Number(esp.id), rol: "titular", ...(nombre ? { nombre } : {}) }).eq("id", data.user.id);
  if (e2) return { error: `Se creó el usuario pero no se pudo asignar su espacio (${e2.message}).` };
  revalidatePath("/usuarios");
  return {
    ok: `Cliente creado con su propio espacio en blanco. Mándale estos datos: entra a smartaccount2026.vercel.app con ${correo} y la contraseña temporal ${contrasena}. Al entrar le pedirá cambiarla; después, en "Mi espacio", agrega su clave de IA y, si quiere, su correo para los avisos.`,
    contrasena,
  };
}

// Nueva contraseña temporal para el titular de un cliente
export async function restablecerCliente(espacioId: number): Promise<Resultado> {
  if (!(await esAdmin())) return { error: "Solo el administrador puede hacer esto." };
  let admin;
  try { admin = createAdminClient(); } catch { return { error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }; }
  const { data: e } = await admin.from("espacios").select("titular_id, principal").eq("id", espacioId).maybeSingle();
  if (!e?.titular_id || e.principal) return { error: "Ese cliente no tiene titular." };
  const contrasena = contrasenaTemporal();
  const { error } = await admin.auth.admin.updateUserById(e.titular_id, { password: contrasena, user_metadata: { debe_cambiar: true } });
  if (error) return { error: `No se pudo restablecer (${error.message}).` };
  return { ok: `Nueva contraseña temporal del cliente: ${contrasena}. Al entrar le pedirá cambiarla.`, contrasena };
}
