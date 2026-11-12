import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, isTaskAuthorized } from '../_shared/auth.ts';
import { refreshDueAccounts } from '../_shared/merchantMp.ts';

/**
 * Tarea de mantenimiento: renueva los tokens OAuth de los comercios que vencen pronto
 * (por defecto, dentro de 7 días). Los access_token de Mercado Pago duran ~180 días.
 * Autorizada para administradores o para la tarea programada (header x-nlid-task-token).
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);

    let authorized = user?.role === 'admin';
    if (!authorized) authorized = await isTaskAuthorized(req, svc);
    if (!authorized) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const windowDays = Math.min(Math.max(Number(body.window_days) || 7, 1), 60);

    const summary = await refreshDueAccounts(svc, windowDays);
    return json({ ok: true, window_days: windowDays, ...summary });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
