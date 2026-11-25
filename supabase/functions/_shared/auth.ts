// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { hmacSha256Hex, timingSafeEqual } from './crypto.ts';
 
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
 
// ── Tareas programadas firmadas (pg_cron + pg_net → Edge Function) ──────────────
//
// public.nlid_invoke_task() firma cada invocación con HMAC-SHA256 y la clave del Vault
// `nlid_task_token` (mismo valor que el secreto NLID_TASK_TOKEN de las Edge Functions):
//
//   x-nlid-signature: t=<unix ms>,v1=<hex HMAC-SHA256(clave, "<t>.<nombre de la función>")>
//
// La clave nunca viaja en la request, la firma vence (anti-replay) y está atada a la función
// destino: una firma de releaseExpiredOrders no sirve para mpRefreshTokens.

export const TASK_SIGNATURE_HEADER = 'x-nlid-signature';
export const TASK_SIGNATURE_TOLERANCE_SECONDS = 300;

export type TaskSignatureFailure =
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_expired'
  | 'key_not_configured'
  | 'invalid_signature';

/** Clave de firma: secreto NLID_TASK_TOKEN (o, por compatibilidad, `task_token` de platform_settings). */
async function taskSigningKey(svc: any) {
  const fromSecret = readSecret('NLID_TASK_TOKEN');
  if (fromSecret) return fromSecret;
  const { data } = await svc.from('platform_settings').select('value').eq('key', 'task_token').maybeSingle();
  return String(data?.value || '');
}

/** Verificación pura (sin red ni base): útil para tests. */
export async function verifyTaskSignatureWithKey({
  header,
  functionName,
  key,
  nowMs = Date.now(),
  toleranceSeconds = TASK_SIGNATURE_TOLERANCE_SECONDS,
}: {
  header?: string | null;
  functionName: string;
  key: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<{ ok: true } | { ok: false; reason: TaskSignatureFailure }> {
  if (!header) return { ok: false, reason: 'missing_signature' };
  const parts: Record<string, string> = {};
  for (const chunk of header.split(',')) {
    const idx = chunk.indexOf('=');
    if (idx > 0) parts[chunk.slice(0, idx).trim()] = chunk.slice(idx + 1).trim();
  }
  const t = parts.t || '';
  const v1 = (parts.v1 || '').toLowerCase();
  if (!/^\d{10,16}$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return { ok: false, reason: 'malformed_signature' };
  if (Math.abs(nowMs - Number(t)) > toleranceSeconds * 1000) return { ok: false, reason: 'timestamp_expired' };
  if (!key) return { ok: false, reason: 'key_not_configured' };

  const expected = await hmacSha256Hex(key, `${t}.${functionName}`);
  return timingSafeEqual(expected, v1) ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}

/** true si la request trae una firma de tarea válida para `functionName`. */
export async function isTaskAuthorized(req: Request, svc: any, functionName: string): Promise<boolean> {
  const header = req.headers.get(TASK_SIGNATURE_HEADER);
  // Sin header no se consulta nada más (ni siquiera la clave).
  if (!header) return false;
  const result = await verifyTaskSignatureWithKey({ header, functionName, key: await taskSigningKey(svc) });
  if (!result.ok) console.warn(`${functionName}: firma de tarea rechazada (${result.reason})`);
  return result.ok;
}