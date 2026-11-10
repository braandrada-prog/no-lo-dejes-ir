// deno-lint-ignore-file no-explicit-any
import { releaseStock } from './inventory.ts';
import { emitEvent, EVENTS } from './events.ts';

export const RESERVATION_MINUTES = 20;

/** Estados del pedido y transiciones permitidas (máquina de estados central). */
export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'picked_up',
  'no_show',
  'cancelled',
  'refunded',
  'expired',
];

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['paid', 'cancelled', 'expired'],
  paid: ['picked_up', 'no_show', 'cancelled', 'refunded'],
  picked_up: ['refunded'],
  no_show: ['refunded'],
  cancelled: [],
  refunded: [],
  expired: [],
};

export function canTransition(from: string, to: string) {
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

export function buildOrderNumber(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `NLID-${y}${m}${d}-${rand}`;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function buildPickupCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}

export function buildQrToken() {
  return crypto.randomUUID();
}

export function reservationDeadline(minutes = RESERVATION_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/** Devuelve unidades al stock de una publicación (compatibilidad con llamadas existentes). */
export async function restockOffer(svc: any, offerId: string, quantity: number, meta: any = {}) {
  if (!offerId || !Number(quantity)) return { ok: false };
  return releaseStock(svc, {
    offerId,
    quantity: Number(quantity),
    orderId: meta.orderId,
    actorEmail: meta.actorEmail || 'system',
    reason: meta.reason || 'Reserva liberada',
    type: meta.type || 'release',
  });
}

/** Anula reservas impagas vencidas y devuelve el inventario. */
export async function expireStaleReservations(svc: any) {
  const now = new Date().toISOString();
  const { data: stale, error } = await svc
    .from('orders')
    .select('*')
    .eq('status', 'pending_payment')
    .lt('reserved_until', now)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;

  let released = 0;
  for (const order of stale ?? []) {
    // Compare-and-set: solo vence si sigue pendiente de pago.
    const { data: applied, error: claimError } = await svc
      .from('orders')
      .update({
        status: 'expired',
        payment_status: 'expired',
        stock_state: 'released',
        refund_reason: 'Reserva vencida sin pago confirmado',
      })
      .eq('id', order.id)
      .eq('status', 'pending_payment')
      .select('id');

    if (claimError) {
      console.error('No se pudo vencer la reserva:', order.id, claimError);
      continue;
    }
    if (!applied?.length) continue;

    await restockOffer(svc, order.offer_id, order.quantity, {
      orderId: order.id,
      reason: 'Reserva vencida',
      type: 'expiry',
    });

    await emitEvent(
      svc,
      EVENTS.orderExpired,
      {
        order_id: order.id,
        order_number: order.order_number,
        offer_id: order.offer_id,
        quantity: order.quantity,
        merchant_id: order.merchant_id || '',
      },
      { merchantId: order.merchant_id, orderId: order.id }
    );

    released += 1;
  }
  return released;
}

/** Marca publicaciones vencidas. */
export async function expireStaleOffers(svc: any) {
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('offers')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', now)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}