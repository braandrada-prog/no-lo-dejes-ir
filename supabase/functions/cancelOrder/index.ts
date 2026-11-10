// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { mpRefundPayment, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { applyRefund, logTransaction } from '../_shared/payments.ts';
import { emitEvent, EVENTS } from '../_shared/events.ts';
import { restockOffer } from '../_shared/reservations.ts';
 
/**
 * Cancelación del consumidor (o del administrador).
 * - Reserva sin pagar: se libera al instante y vuelve el stock.
 * - Reserva pagada y no retirada: se pide el reembolso a Mercado Pago. Si el proveedor
 *   no lo acepta en el momento, el pedido queda marcado `refund_required` para el equipo.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 
  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) return json({ error: 'auth_required' }, 401);
 
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || '').trim();
    const reason = String(body.reason || '').slice(0, 240);
 
    if (!orderId) return json({ error: 'Falta el pedido.' }, 400);
 
    const { data: order, error: orderError } = await svc
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'Pedido inexistente' }, 404);
    if (user.role !== 'admin' && order.user_email !== user.email) {
      return json({ error: 'Forbidden' }, 403);
    }
 
    if (['cancelled', 'expired', 'refunded'].includes(order.status)) {
      return json({ ok: true, status: order.status, message: 'El pedido ya no está activo.' });
    }
    if (order.status === 'picked_up') {
      return json(
        { error: 'El pedido ya fue retirado. Escribinos desde Ayuda para revisar el caso.' },
        409
      );
    }
 
    const now = new Date().toISOString();
 
    if (order.status === 'pending_payment') {
      // Compare-and-set: solo cancela si sigue pendiente de pago.
      const { data: claimed, error: claimError } = await svc
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'cancelled',
          stock_state: 'released',
          settlement_status: 'void',
          qr_token: null,
          refund_reason: reason || 'Cancelada por el consumidor',
          last_reconciled_at: now,
        })
        .eq('id', order.id)
        .eq('status', 'pending_payment')
        .select();
      if (claimError) throw claimError;
 
      if (!claimed?.length) {
        const { data: fresh } = await svc.from('orders').select('status').eq('id', order.id).maybeSingle();
        return json({ ok: true, status: fresh?.status ?? order.status, message: 'El pedido ya cambió de estado.' });
      }
 
      await restockOffer(svc, order.offer_id, order.quantity, {
        orderId: order.id,
        reason: 'Cancelación del consumidor',
        type: 'release',
        actorEmail: user.email,
      });
 
      await emitEvent(
        svc,
        EVENTS.orderCancelled,
        {
          order_id: order.id,
          order_number: order.order_number,
          merchant_id: order.merchant_id || '',
          quantity: order.quantity,
          reason: reason || 'Cancelada por el consumidor',
        },
        { merchantId: order.merchant_id, orderId: order.id }
      );
 
      const { error: notifError } = await svc.from('notifications').insert({
        user_email: order.user_email,
        title: 'Reserva cancelada',
        message: `Cancelamos la reserva ${order.order_number}. Las unidades volvieron a estar disponibles.`,
        type: 'order',
        link: `/compras/${order.id}`,
      });
      if (notifError) console.error('No se pudo crear la notificación:', notifError);
 
      await logTransaction(svc, {
        environment: order.payment_environment || 'test',
        kind: 'status_applied',
        order_id: order.id,
        order_number: order.order_number,
        provider_status: 'cancelled',
        amount: order.total,
        dedupe_key: `order:${order.id}:cancel:consumer`,
        source: 'consumer',
        actor_email: user.email,
        detail: 'Cancelación con liberación de stock',
      });
 
      return json({ ok: true, status: 'cancelled', stock_released: true });
    }
 
    // Pedido pagado: reembolso.
    const mp = await resolveMpEnvironment(svc, readSecret);
    const paymentId = String(order.payment_id || '');
 
    if (mp.ready && paymentId) {
      const refund = await mpRefundPayment(mp.token, paymentId, Number(order.total));
      if (refund.ok) {
        await logTransaction(svc, {
          environment: mp.environment,
          kind: 'refund_requested',
          order_id: order.id,
          order_number: order.order_number,
          payment_id: paymentId,
          provider_status: 'refunded',
          amount: order.total,
          dedupe_key: `order:${order.id}:refund-request:${paymentId}`,
          source: 'consumer',
          actor_email: user.email,
          detail: 'Reembolso solicitado por el consumidor',
        });
        const applied = await applyRefund(svc, {
          order,
          paymentId,
          amount: Number(order.total),
          reason: reason || 'Cancelación solicitada por el consumidor',
          environment: mp.environment,
          source: 'consumer',
          actorEmail: user.email,
        });
        return json({ ok: true, status: applied.status, refunded: applied.status === 'refunded' });
      }
    }
 
    const { error: pendingError } = await svc
      .from('orders')
      .update({
        refund_required: true,
        refund_reason: reason || 'Reembolso solicitado por el consumidor',
      })
      .eq('id', order.id);
    if (pendingError) throw pendingError;
 
    await logTransaction(svc, {
      environment: mp.environment,
      kind: 'error',
      order_id: order.id,
      order_number: order.order_number,
      payment_id: paymentId,
      provider_status: 'refund_pending',
      amount: order.total,
      dedupe_key: `order:${order.id}:refund-pending:${Date.now()}`,
      source: 'consumer',
      actor_email: user.email,
      detail: 'El proveedor no confirmó el reembolso: queda pendiente de gestión',
    });
 
    const { error: notifError } = await svc.from('notifications').insert({
      user_email: order.user_email,
      title: 'Solicitud de reembolso registrada',
      message: `Registramos tu solicitud para el pedido ${order.order_number}. El equipo la procesa y te avisamos.`,
      type: 'payment',
      link: `/compras/${order.id}`,
    });
    if (notifError) console.error('No se pudo crear la notificación:', notifError);
 
    return json(
      {
        ok: true,
        status: order.status,
        refund_pending: true,
        message: 'Registramos tu solicitud de reembolso. El equipo la procesa en las próximas horas.',
      },
      202
    );
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});