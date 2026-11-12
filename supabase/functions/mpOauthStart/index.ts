import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { mpAuthorizationUrl, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { pkceChallenge, randomUrlSafe } from '../_shared/crypto.ts';

/** Solo rutas internas del frontend: evita redirecciones abiertas. */
function safeReturnPath(value: unknown, fallback = '/comercio/dashboard') {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  return path.slice(0, 200);
}

/**
 * Inicia la vinculación OAuth de un comercio con Mercado Pago.
 * Requiere sesión: solo el dueño del comercio (businesses.owner_id) puede vincularlo,
 * porque la cuenta de Mercado Pago que autoriza es la que va a recibir los cobros.
 * Devuelve { url } para redirigir el navegador a Mercado Pago.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) return json({ error: 'auth_required' }, 401);

    const body = await req.json().catch(() => ({}));
    const requestedBusiness = String(body.business_id || '').trim();

    let query = svc.from('businesses').select('id, name, owner_id').eq('owner_id', user.id);
    if (requestedBusiness) query = query.eq('id', requestedBusiness);
    const { data: businesses, error: businessError } = await query.limit(2);
    if (businessError) throw businessError;

    if (!businesses?.length) {
      return json({ error: 'business_not_found', message: 'No encontramos un comercio a tu nombre.' }, 404);
    }
    if (businesses.length > 1) {
      return json({ error: 'business_required', message: 'Indicá qué comercio querés vincular.' }, 400);
    }
    const business = businesses[0];

    const mp = await resolveMpEnvironment(svc, readSecret);
    if (!mp.oauthReady) {
      return json(
        {
          error: 'oauth_not_configured',
          environment: mp.environment,
          message: 'La vinculación con Mercado Pago todavía no está configurada. Avisale al administrador.',
        },
        503
      );
    }

    // Limpieza oportunista de estados vencidos.
    await svc.from('mp_oauth_states').delete().lt('expires_at', new Date().toISOString());

    const state = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(48);
    const usePkce = readSecret('MP_OAUTH_PKCE') !== 'false';

    const { error: stateError } = await svc.from('mp_oauth_states').insert({
      state,
      business_id: business.id,
      user_id: user.id,
      environment: mp.environment,
      code_verifier: codeVerifier,
      return_path: safeReturnPath(body.return_path),
    });
    if (stateError) throw stateError;

    const url = mpAuthorizationUrl({
      clientId: mp.clientId,
      redirectUri: mp.redirectUri,
      state,
      codeChallenge: usePkce ? await pkceChallenge(codeVerifier) : null,
    });

    return json({ url, environment: mp.environment, business_id: business.id });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
