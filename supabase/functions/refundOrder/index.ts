// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { mpRefundPayment, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { applyRefund, logTransaction } from '../_shared/payments.ts';
import { resolveOrderToken } from '../_shared/merchantMp.ts';
 
/**
 * Reembolso ejecutado por el equipo de la plataforma.
 * - `manual: true` registra un reembolso ya hecho desde el panel de Mercado Pago
 *   (útil si el cobro no está vinculado o el proveedor lo gestionó manualmente).
 * - Sin `manual`, se solicita el reembolso a Mercado Pago antes de cerrar el pedido.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 
  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
 
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || '').trim();
    const paymentId = String(body.payment_id || '').trim();
    const manual = Boolean(body.manual);
    const reason = String(body.reason || '').slice(0, 240);
    const amount = Number(body.amount) || 0;
 
    if (!orderId) return json({ error: 'Falta el pedido.' }, 400);
 
    const { data: order, error: orderError } = await svc
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'Pedido inexistente' }, 404);
    if (order.status === 'refunded') {
      return json({ ok: true, status: 'already_refunded', message: 'El pedido ya estaba reembolsado.' });
    }
 
    const targetPayment = paymentId || String(order.payment_id || '');
    const refundAmount = amount > 0 ? amount : Number(order.total) || 0;
 
    const mp = await resolveMpEnvironment(svc, readSecret, order.payment_environment || undefined);
 
    if (!manual) {
      // El reembolso se pide con el token de la cuenta que cobró (la del comercio).
      // En pagos con split, Mercado Pago devuelve también el marketplace_fee.
      const credentials = await resolveOrderToken(svc, order, mp);
      if (!credentials.ok) {
        return json(
          {
            error: 'payments_not_configured',
            message:
              credentials.source === 'merchant'
                ? 'La cuenta de Mercado Pago del comercio no está vinculada o venció. Pedile que la reconecte o registrá el reembolso como manual.'
                : 'Cargá las credenciales del entorno para reembolsar.',
            detail: { message: credentials.reason || '' },
          },
          503
        );
      }
      if (!targetPayment) {
        return json(
          { error: 'El pedido no tiene un pago identificado. Podés registrarlo como reembolso manual.' },
          409
        );
      }
 
      const refund = await mpRefundPayment(credentials.token, targetPayment, refundAmount);
      if (!refund.ok) {
        await logTransaction(svc, {
          environment: mp.environment,
          kind: 'error',
          order_id: order.id,
          order_number: order.order_number,
          payment_id: targetPayment,
          provider_status: 'refund_failed',
          amount: refundAmount,
          dedupe_key: `order:${order.id}:refund-failed:${targetPayment}:${Date.now()}`,
          source: 'admin',
          actor_email: user.email,
          detail: JSON.stringify(refund.data || {}).slice(0, 400),
        });
        return json(
          {
            error: 'refund_failed',
            message:
              'Mercado Pago no confirmó el reembolso. Revisá la operación en su panel o registralo como manual.',
            detail: refund.data?.message || refund.error || '',
          },
          502
        );
      }
 
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'refund_requested',
        order_id: order.id,
        order_number: order.order_number,
        payment_id: targetPayment,
        provider_status: 'refunded',
        amount: refundAmount,
        dedupe_key: `order:${order.id}:refund-request:${targetPayment}`,
        source: 'admin',
        actor_email: user.email,
        detail: 'Reembolso aceptado por el proveedor',
      });
    }
 
    const applied = await applyRefund(svc, {
      order,
      paymentId: targetPayment,
      amount: refundAmount,
      reason: reason || (manual ? 'Reembolso registrado manualmente' : 'Reembolso aprobado por el equipo'),
      environment: mp.environment,
      source: 'admin',
      actorEmail: user.email,
    });
 
    return json({ ok: true, status: applied.status, manual });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});