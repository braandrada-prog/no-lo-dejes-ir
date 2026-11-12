// deno-lint-ignore-file no-explicit-any
/**
 * Validación de retiro compartida por el panel de administración y la futura
 * app de comerciantes. El cambio de estado es un compare-and-set: un UPDATE con
 * condición `status = 'paid'` garantiza que un mismo QR no se pueda canjear
 * dos veces aunque dos dispositivos lo escaneen al mismo tiempo.
 *
 * Regla de oro: solo un pedido con pago aprobado puede entregarse. El QR se emite
 * al confirmarse el pago y se borra al cancelar, vencer o reembolsar.
 */
import { commitStock } from './inventory.ts';
import { emitEvent, EVENTS } from './events.ts';

type Svc = any;

export async function findOrderByCode(svc: Svc, code: string) {
  const { data: byToken, error: tokenError } = await svc
    .from('orders')
    .select('*')
    .eq('qr_token', code)
    .limit(1)
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (byToken) return byToken;

  const { data: byCode, error: codeError } = await svc
    .from('orders')
    .select('*')
    .eq('pickup_code', code.toUpperCase())
    .limit(1)
    .maybeSingle();
  if (codeError) throw codeError;
  return byCode ?? null;
}

async function logAttempt(
  svc: Svc,
  { actorEmail, actorRole, channel, code, order, detail, action }: any
) {
  // La auditoría no bloquea el retiro.
  const { error } = await svc.from('audit_logs').insert({
    actor_email: actorEmail || '',
    actor_role: actorRole || '',
    source: channel,
    action,
    target: order?.order_number || String(code || '').slice(0, 24),
    entity: 'Order',
    entity_id: order?.id ?? null,
    merchant_id: order?.merchant_id ?? null,
    branch_id: order?.branch_id ?? null,
    details: detail,
  });
  if (error) console.error('No se pudo registrar la auditoría:', error);
}

const INVALID_STATUS: Record<string, string> = {
  pending_payment: 'El pago no está confirmado: este pedido todavía no tiene un QR válido.',
  expired: 'La reserva venció sin pago confirmado: el QR ya no es válido.',
  cancelled: 'La reserva fue cancelada: el QR ya no es válido.',
  refunded: 'El pedido fue reembolsado: el QR quedó anulado.',
  no_show: 'El pedido quedó marcado como no retirado.',
  paid: 'El pedido no tiene un pago confirmado.',
};

export async function redeemOrderByCode(
  svc: Svc,
  { code, actorEmail, actorRole, channel = 'merchant_app', merchantId, branchIds }: any
) {
  const clean = String(code || '').trim();
  if (!clean) return { status: 400, body: { error: 'Falta el código o el QR.' } };

  const order = await findOrderByCode(svc, clean);
  if (!order) {
    await logAttempt(svc, {
      actorEmail,
      actorRole,
      channel,
      code: clean,
      detail: 'Código o QR inexistente',
      action: 'order.redeem_failed',
    });
    return { status: 404, body: { error: 'Código inexistente o QR inválido.', code: 'invalid_qr' } };
  }

  if (merchantId && order.merchant_id && order.merchant_id !== merchantId) {
    return { status: 403, body: { error: 'Este pedido pertenece a otro comercio.' } };
  }
  if (Array.isArray(branchIds) && branchIds.length && order.branch_id && !branchIds.includes(order.branch_id)) {
    return { status: 403, body: { error: 'Este pedido se retira en otra sucursal.' } };
  }

  if (order.status === 'picked_up') {
    await logAttempt(svc, {
      actorEmail,
      actorRole,
      channel,
      code: clean,
      order,
      detail: `Intento de reutilizar un QR ya canjeado (${order.redeemed_at || ''})`,
      action: 'order.redeem_failed',
    });
    return {
      status: 409,
      body: {
        error: 'Este pedido ya fue entregado: el QR es de un solo uso.',
        code: 'already_redeemed',
        already_redeemed: true,
        redeemed_at: order.redeemed_at || '',
        order_number: order.order_number,
      },
    };
  }

  if (order.status !== 'paid') {
    await logAttempt(svc, {
      actorEmail,
      actorRole,
      channel,
      code: clean,
      order,
      detail: `Intento de retiro con estado ${order.status}`,
      action: 'order.redeem_failed',
    });
    return {
      status: 409,
      body: {
        error: INVALID_STATUS[order.status] || 'El pedido no tiene un pago confirmado.',
        code: order.status === 'refunded' ? 'refunded' : 'not_paid',
        status: order.status,
      },
    };
  }

  // Compare-and-set: solo actualiza si el pedido sigue en 'paid'.
  // Si dos dispositivos llegan a la vez, Postgres deja pasar a uno solo.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await svc
    .from('orders')
    .update({
      status: 'picked_up',
      redeemed_at: now,
      redeemed_by: actorEmail,
      pickup_channel: channel,
    })
    .eq('id', order.id)
    .eq('status', 'paid')
    .select();
  if (claimError) throw claimError;

  if (!claimed?.length) {
    return {
      status: 409,
      body: {
        error: 'Este pedido ya fue entregado: el QR es de un solo uso.',
        code: 'already_redeemed',
        already_redeemed: true,
      },
    };
  }

  const updated = claimed[0];

  await commitStock(svc, {
    offerId: order.offer_id,
    quantity: order.quantity,
    orderId: order.id,
    actorEmail,
    merchantId: order.merchant_id,
    branchId: order.branch_id,
  });

  await logAttempt(svc, {
    actorEmail,
    actorRole,
    channel,
    code: clean,
    order,
    detail: `Retiro validado para ${order.user_email}`,
    action: 'order.redeem',
  });

  const { error: notifError } = await svc.from('notifications').insert({
    user_email: order.user_email,
    title: 'Retiro confirmado',
    message: `Registramos el retiro de tu pedido ${order.order_number}. ¡Gracias por rescatar alimentos!`,
    type: 'pickup',
    link: `/compras/${order.id}`,
  });
  if (notifError) console.error('No se pudo crear la notificación:', notifError);

  await emitEvent(
    svc,
    EVENTS.orderRedeemed,
    {
      order_id: order.id,
      order_number: order.order_number,
      merchant_id: order.merchant_id || '',
      branch_id: order.branch_id || '',
      quantity: order.quantity,
      total: order.total,
      redeemed_by: actorEmail,
      channel,
    },
    { merchantId: order.merchant_id, orderId: order.id }
  );

  return { status: 200, body: { ok: true, order: updated } };
}