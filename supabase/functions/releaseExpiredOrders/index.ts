// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, isTaskAuthorized } from '../_shared/auth.ts';
import { expireStaleReservations, expireStaleOffers } from '../_shared/reservations.ts';

/**
 * Tarea de mantenimiento: libera reservas impagas vencidas y expira publicaciones.
 * Autorizada para administradores (JWT) o para la tarea programada firmada con
 * HMAC-SHA256 (header x-nlid-signature, ver _shared/auth.ts). Sin ninguna → 401.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    // 1. Firma de la tarea programada (antes de cualquier lógica de negocio).
    if (!(await isTaskAuthorized(req, svc, 'releaseExpiredOrders'))) {
      // 2. Alternativa: administrador autenticado.
      const user = await getAuthedUser(req, svc);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    }

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