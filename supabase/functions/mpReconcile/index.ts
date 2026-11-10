// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { mpGetPayment, mpSearchPayments, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { applyPayment, logTransaction } from '../_shared/payments.ts';

async function reconcileOrder(svc: any, mp: any, order: any, meta: any) {
  const found = new Map<string, any>();

  const search = await mpSearchPayments(mp.token, order.id);
  if (search.ok) {
    for (const payment of search.data?.results || []) {
      if (payment?.id) found.set(String(payment.id), payment);
    }
  }

  if (order.payment_id) {
    const single = await mpGetPayment(mp.token, order.payment_id);
    if (single.ok && single.data?.id) found.set(String(single.data.id), single.data);
  }

  if (!found.size) return { status: 'no_payments' };

  const statuses: any[] = [];
  for (const payment of found.values()) {
    const applied = await applyPayment(svc, {
      order,
      payment,
      environment: mp.environment,
      source: meta.source,
      actorEmail: meta.actorEmail,
    });
    statuses.push({ payment_id: String(payment.id), provider_status: String(payment.status), result: applied.status });
  }

  await logTransaction(svc, {
    environment: mp.environment,
    kind: 'reconcile',
    order_id: order.id,
    order_number: order.order_number,
    payment_id: String((found.values().next().value || {}).id || ''),
    provider_status: statuses[0]?.provider_status || '',
    amount: Number(order.total) || 0,
    dedupe_key: `order:${order.id}:reconcile:${Date.now()}`,
    source: meta.source,
    actor_email: meta.actorEmail,
    detail: JSON.stringify(statuses).slice(0, 600),
  });

  return { status: statuses[0]?.result || 'unknown', payments: statuses };
}

// Token para la tarea programada. Preferí el secreto NLID_TASK_TOKEN; si no existe,
// se usa el valor `task_token` de platform_settings (como en Base44).
async function expectedTaskToken(svc: any) {
  const fromSecret = readSecret('NLID_TASK_TOKEN');
  if (fromSecret) return fromSecret;
  const { data } = await svc.from('platform_settings').select('value').eq('key', 'task_token').maybeSingle();
  return data?.value || '';
}

/**
 * Conciliación de pagos.
 * - Consumidor: consulta su propio pedido ("ya pagué, verificar").
 * - Administrador o tarea programada: revisa los pedidos pendientes y los sincroniza.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);

    let taskAuthorized = false;
    if (!user) {
      const token = req.headers.get('x-nlid-task-token') || '';
      if (token) {
        const expected = await expectedTaskToken(svc);
        taskAuthorized = Boolean(expected) && token === expected;
      }
    }
    if (!user && !taskAuthorized) return json({ error: 'Unauthorized' }, 401);

    const isAdmin = user?.role === 'admin';

    const mp = await resolveMpEnvironment(svc, readSecret);
    if (!mp.ready) {
      return json({ error: 'payments_not_configured', environment: mp.environment }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || '').trim();

    if (orderId) {
      const { data: order, error: orderError } = await svc
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return json({ error: 'Pedido inexistente' }, 404);
      if (!isAdmin && !taskAuthorized && order.user_email !== user?.email) {
        return json({ error: 'Forbidden' }, 403);
      }

      const result = await reconcileOrder(svc, mp, order, {
        source: isAdmin ? 'admin' : 'consumer',
        actorEmail: user?.email || 'task',
      });

      const { data: fresh } = await svc.from('orders').select('*').eq('id', order.id).maybeSingle();
      const current = fresh ?? order;

      return json({
        ok: true,
        environment: mp.environment,
        status: current.status,
        payment_status: current.payment_status || '',
        qr_ready: Boolean(current.qr_token) && current.status === 'paid',
        refund_required: Boolean(current.refund_required),
        reconciled: result,
      });
    }

    if (!isAdmin && !taskAuthorized) {
      return json({ error: 'Forbidden' }, 403);
    }

    const threshold = new Date(Date.now() - 90 * 1000).toISOString();
    const { data: pending, error: pendingError } = await svc
      .from('orders')
      .select('*')
      .eq('status', 'pending_payment')
      .lt('created_at', threshold)
      .order('created_at', { ascending: true })
      .limit(15);
    if (pendingError) throw pendingError;

    const summary = { checked: 0, paid: 0, pending: 0, released: 0, refund_required: 0 };
    for (const order of pending ?? []) {
      const result = await reconcileOrder(svc, mp, order, { source: 'reconcile', actorEmail: 'reconcile' });
      summary.checked += 1;
      if (result.status === 'paid' || result.status === 'paid_recovered') summary.paid += 1;
      else if (result.status === 'pending' || result.status === 'no_payments') summary.pending += 1;
      else if (result.status === 'released') summary.released += 1;
      else if (result.status === 'refund_required') summary.refund_required += 1;
    }

    return json({ ok: true, environment: mp.environment, ...summary });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});