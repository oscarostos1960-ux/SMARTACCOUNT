-- Las funciones de permisos solo las usan las políticas RLS de usuarios firmados.
drop function if exists public.rol_actual();
revoke execute on function public.es_titular() from public, anon;
revoke execute on function public.puede_consultar() from public, anon;
grant execute on function public.es_titular() to authenticated;
grant execute on function public.puede_consultar() to authenticated;
