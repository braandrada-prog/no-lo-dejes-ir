// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, isTaskAuthorized } from '../_shared/auth.ts';
import { expireStaleReservations, expireStaleOffers } from '../_shared/reservations.ts';

/**
 * Tarea de mantenimiento: libera reservas impagas vencidas y expira publicaciones.
 * Autorizada para administradores o para tareas programadas mediante el header
 * x-nlid-task-token (secreto NLID_TASK_TOKEN o `task_token` en platform_settings).
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);

    let authorized = user?.role === 'admin';
    if (!authorized) authorized = await isTaskAuthorized(req, svc);
    if (!authorized) return json({ error: 'Forbidden' }, 403);

    const releasedOrders = await expireStaleReservations(svc);
    const expiredOffers = await expireStaleOffers(svc);

    return json({
      ok: true,
      released_orders: releasedOrders,
      expired_offers: expiredOffers,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});