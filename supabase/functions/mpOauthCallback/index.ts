// deno-lint-ignore-file no-explicit-any
import { adminClient, readSecret } from '../_shared/auth.ts';
import { mpExchangeCode, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { saveMerchantTokens } from '../_shared/merchantMp.ts';

/**
 * Callback OAuth de Mercado Pago (redirect_uri registrada en la aplicación).
 *
 * Se despliega con verify_jwt = false: el navegador llega acá redirigido por Mercado Pago,
 * sin JWT de Supabase. La seguridad la da el `state`, que:
 *   - fue creado por mpOauthStart para un usuario y comercio concretos,
 *   - es de un solo uso (used_at) y vence a los 10 minutos,
 *   - guarda el code_verifier PKCE, que nunca viajó al navegador.
 *
 * Siempre termina redirigiendo al frontend con ?mp=connected | ?mp=error&reason=...
 */
function redirectTo(path: string, params: Record<string, string>) {
  const base = (readSecret('APP_URL') || '').replace(/\/$/, '');
  const url = new URL(`${base || 'http://localhost:5173'}${path || '/comercio/dashboard'}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const providerError = url.searchParams.get('error') || '';

  if (!state) return redirectTo('/comercio/dashboard', { mp: 'error', reason: 'missing_state' });

  try {
    const svc = adminClient();

    // Consumo atómico del state: solo una solicitud puede marcarlo como usado.
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await svc
      .from('mp_oauth_states')
      .update({ used_at: now })
      .eq('state', state)
      .is('used_at', null)
      .gt('expires_at', now)
      .select('state, business_id, user_id, environment, code_verifier, return_path')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return redirectTo('/comercio/dashboard', { mp: 'error', reason: 'invalid_state' });

    const returnPath = claimed.return_path || '/comercio/dashboard';
    if (providerError || !code) {
      return redirectTo(returnPath, { mp: 'error', reason: providerError || 'missing_code' });
    }

    // El dueño tiene que seguir siéndolo al volver de Mercado Pago.
    const { data: business } = await svc
      .from('businesses')
      .select('id, owner_id')
      .eq('id', claimed.business_id)
      .maybeSingle();
    if (!business || business.owner_id !== claimed.user_id) {
      return redirectTo(returnPath, { mp: 'error', reason: 'not_owner' });
    }

    const mp = await resolveMpEnvironment(svc, readSecret, claimed.environment);
    if (!mp.oauthReady) return redirectTo(returnPath, { mp: 'error', reason: 'oauth_not_configured' });

    const usePkce = readSecret('MP_OAUTH_PKCE') !== 'false';
    const exchange = await mpExchangeCode({
      mp,
      code,
      codeVerifier: usePkce ? claimed.code_verifier : null,
    });
    if (!exchange.ok) {
      console.error('Intercambio OAuth rechazado:', exchange.status, JSON.stringify(exchange.data).slice(0, 300));
      return redirectTo(returnPath, { mp: 'error', reason: 'exchange_failed' });
    }

    await saveMerchantTokens(svc, {
      businessId: claimed.business_id,
      environment: claimed.environment,
      tokenData: exchange.data,
      connectedBy: claimed.user_id,
    });

    const { error: auditError } = await svc.from('audit_logs').insert({
      actor_email: 'mpOauthCallback',
      actor_role: 'merchant',
      source: 'system',
      action: 'merchant.mp_connected',
      target: String(exchange.data?.user_id || ''),
      entity: 'Business',
      entity_id: claimed.business_id,
      merchant_id: claimed.business_id,
      details: `Cuenta de Mercado Pago vinculada (${claimed.environment})`,
    });
    if (auditError) console.error('No se pudo registrar la auditoría:', auditError);

    // El code_verifier ya no sirve: se borra el state.
    await svc.from('mp_oauth_states').delete().eq('state', state);

    return redirectTo(returnPath, { mp: 'connected' });
  } catch (error) {
    console.error('mpOauthCallback:', (error as Error).message);
    return redirectTo('/comercio/dashboard', { mp: 'error', reason: 'server_error' });
  }
});
