import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser } from '../_shared/auth.ts';
import { readSettings } from '../_shared/commissions.ts';
import { DEFAULT_PICKUP_TOLERANCE_MINUTES, redeemOrderByCode } from '../_shared/pickup.ts';

const CODE_RE = /^[A-Z0-9]{6}$/;

/**
 * Validación de retiro desde el panel del comercio (ingreso manual del código de 6 caracteres).
 *
 * Seguridad:
 *  - Requiere sesión (verify_jwt por defecto). El usuario tiene que ser dueño de al menos
 *    un comercio (businesses.owner_id = auth.uid()).
 *  - La búsqueda se acota a SUS comercios: un código de otro local responde igual que un
 *    código inexistente (no revela que exista).
 *  - La respuesta nunca incluye email, qr_token ni pickup_code del comprador.
 *
 * Horario de retiro (platform_settings, opcionales):
 *  - pickup_window_enforced  → 'false' desactiva el control (por defecto activo).
 *  - pickup_tolerance_minutes → margen antes y después de la franja (por defecto 30).
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) return json({ error: 'Necesitás iniciar sesión para validar retiros.' }, 401);

    const { data: businesses, error: businessError } = await svc
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id);
    if (businessError) throw businessError;
    const merchantIds = (businesses ?? []).map((b: { id: string }) => String(b.id));
    if (!merchantIds.length) {
      return json({ error: 'Tu usuario no tiene un comercio asociado.', code: 'no_business' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '')
      .toUpperCase()
      .replace(/[\s-]/g, '');
    if (!CODE_RE.test(code)) {
      return json(
        { error: 'El código de retiro tiene 6 letras o números. Revisalo en la app del cliente.', code: 'invalid_format' },
        400
      );
    }

    let enforceWindow = true;
    let toleranceMinutes = DEFAULT_PICKUP_TOLERANCE_MINUTES;
    try {
      const settings = await readSettings(svc, ['pickup_window_enforced', 'pickup_tolerance_minutes']);
      if (String(settings.pickup_window_enforced ?? '').trim().toLowerCase() === 'false') enforceWindow = false;
      const parsed = Number(settings.pickup_tolerance_minutes);
      if (settings.pickup_tolerance_minutes != null && Number.isFinite(parsed) && parsed >= 0) {
        toleranceMinutes = Math.min(parsed, 24 * 60);
      }
    } catch (error) {
      // Sin configuración legible se usan los valores por defecto.
      console.error('No se pudo leer la configuración de retiro:', (error as Error).message);
    }

    const result = await redeemOrderByCode(svc, {
      code,
      actorEmail: user.email,
      actorRole: 'merchant',
      channel: 'merchant_panel',
      merchantIds,
      enforceWindow,
      toleranceMinutes,
    });

    // El pedido completo (con email, QR y código) nunca sale hacia el comercio.
    const { order: _order, ...safeBody } = result.body as Record<string, unknown>;
    return json(safeBody, result.status);
  } catch (error) {
    console.error('merchantRedeem:', (error as Error).message);
    return json({ error: 'No pudimos validar el retiro. Probá de nuevo en unos segundos.' }, 500);
  }
});
