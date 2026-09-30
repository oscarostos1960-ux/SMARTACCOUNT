import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador: solo para subir documentos directo a Storage (respeta los permisos del usuario).
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
