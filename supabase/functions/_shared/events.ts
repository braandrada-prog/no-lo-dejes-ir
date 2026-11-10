// deno-lint-ignore-file no-explicit-any
/** Buzón de eventos para webhooks (outbox) y para la futura app de comerciantes. */

export async function emitEvent(
  svc: any,
  eventType: string,
  payload: any,
  { merchantId, orderId }: { merchantId?: string; orderId?: string } = {}
) {
  // Un evento no entregado nunca debe cortar un cobro o un retiro.
  const { data, error } = await svc
    .from('webhook_events')
    .insert({
      event_type: eventType,
      merchant_id: merchantId || payload?.merchant_id || null,
      order_id: orderId || payload?.order_id || null,
      payload: payload || {},
      status: 'pending',
      attempts: 0,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('No se pudo registrar el evento:', error);
    return null;
  }
  return data;
}

export const EVENTS = {
  orderCreated: 'order.created',
  orderExpired: 'order.expired',
  paymentApproved: 'payment.approved',
  paymentRejected: 'payment.rejected',
  orderRedeemed: 'order.redeemed',
  orderCancelled: 'order.cancelled',
  orderRefunded: 'order.refunded',
  stockAdjusted: 'stock.adjusted',
  settlementCreated: 'settlement.created',
  merchantStatusChanged: 'merchant.status_changed',
};