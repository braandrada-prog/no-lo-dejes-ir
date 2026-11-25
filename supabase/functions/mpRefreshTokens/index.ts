import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, isTaskAuthorized } from '../_shared/auth.ts';
import { refreshDueAccounts } from '../_shared/merchantMp.ts';

/**
 * Tarea de mantenimiento: renueva los tokens OAuth de los comercios que vencen pronto
 * (por defecto, dentro de 7 días). Los access_token de Mercado Pago duran ~180 días.
 * Autorizada para administradores (JWT) o para la tarea programada firmada con
 * HMAC-SHA256 (header x-nlid-signature, ver _shared/auth.ts). Sin ninguna → 401.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    // 1. Firma de la tarea programada (antes de leer el body o tocar datos).
    if (!(await isTaskAuthorized(req, svc, 'mpRefreshTokens'))) {
      // 2. Alternativa: administrador autenticado.
      const user = await getAuthedUser(req, svc);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const windowDays = Math.min(Math.max(Number(body.window_days) || 7, 1), 60);

    const summary = await refreshDueAccounts(svc, windowDays);
    return json({ ok: true, window_days: windowDays, ...summary });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
