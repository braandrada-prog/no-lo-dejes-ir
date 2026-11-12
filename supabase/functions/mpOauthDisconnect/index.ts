// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { resolveMpEnvironment } from '../_shared/mpConfig.ts';

/**
 * Desvincula la cuenta de Mercado Pago de un comercio en el entorno activo.
 * Puede hacerlo el dueño del comercio o un administrador. Los tokens se borran
 * (no solo se marcan): sin cuenta vinculada el comercio no puede vender.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) return json({ error: 'auth_required' }, 401);

    const body = await req.json().catch(() => ({}));
    const isAdmin = user.role === 'admin';
    let businessId = String(body.business_id || '').trim();

    if (!businessId) {
      if (isAdmin) return json({ error: 'business_required' }, 400);
      const { data: own } = await svc.from('businesses').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
      businessId = own?.id || '';
    }
    if (!businessId) return json({ error: 'business_not_found' }, 404);

    if (!isAdmin) {
      const { data: business } = await svc.from('businesses').select('owner_id').eq('id', businessId).maybeSingle();
      if (!business || business.owner_id !== user.id) return json({ error: 'Forbidden' }, 403);
    }

    const mp = await resolveMpEnvironment(svc, readSecret);
    const environment = isAdmin && body.environment ? String(body.environment) : mp.environment;

    const { data, error } = await svc
      .from('merchant_mp_accounts')
      .update({
        status: 'revoked',
        access_token_enc: null,
        refresh_token_enc: null,
        last_error: `Desvinculada por ${isAdmin ? 'administrador' : 'el comercio'}`,
      })
      .eq('business_id', businessId)
      .eq('environment', environment)
      .select('id');
    if (error) throw error;

    const { error: auditError } = await svc.from('audit_logs').insert({
      actor_email: user.email,
      actor_role: isAdmin ? 'admin' : 'merchant',
      source: 'system',
      action: 'merchant.mp_disconnected',
      target: businessId,
      entity: 'Business',
      entity_id: businessId,
      merchant_id: businessId,
      details: `Cuenta de Mercado Pago desvinculada (${environment})`,
    });
    if (auditError) console.error('No se pudo registrar la auditoría:', auditError);

    return json({ ok: true, disconnected: Boolean(data?.length), environment });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
