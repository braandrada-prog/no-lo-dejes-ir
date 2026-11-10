// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
 
// Cliente con la clave de servicio (equivale a `base44.asServiceRole`).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
export function adminClient(): any {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}
 
export type AuthedUser = { id: string; email: string; role: string };
 
// Devuelve el usuario del JWT (con su rol en `profiles`) o null si no hay sesión válida.
export async function getAuthedUser(req: Request, svc: any): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
 
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data?.user) return null;
 
  const { data: profile } = await svc
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
 
  return { id: data.user.id, email: data.user.email ?? '', role: profile?.role ?? 'user' };
}
 
// Reemplaza `secrets.get` de Base44. Se cargan con: supabase secrets set NOMBRE=valor
export function readSecret(name: string): string {
  try {
    return Deno.env.get(name) || '';
  } catch {
    return '';
  }
}
 
// Autoriza tareas programadas mediante el header x-nlid-task-token.
// Preferí el secreto NLID_TASK_TOKEN; si no existe, se usa `task_token` de platform_settings.
export async function isTaskAuthorized(req: Request, svc: any): Promise<boolean> {
  const token = req.headers.get('x-nlid-task-token') || '';
  if (!token) return false;
 
  let expected = readSecret('NLID_TASK_TOKEN');
  if (!expected) {
    const { data } = await svc.from('platform_settings').select('value').eq('key', 'task_token').maybeSingle();
    expected = data?.value || '';
  }
  return Boolean(expected) && token === expected;
}