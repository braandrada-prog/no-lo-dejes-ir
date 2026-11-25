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

  if (!stale?.length) return 0;

  // 1) Un solo UPDATE por lotes con compare-and-set: Postgres solo modifica (y devuelve)
  //    las filas que SIGUEN en pending_payment. Si un webhook confirmó el pago entre el
  //    SELECT y este UPDATE, ese pedido no se vence ni se le devuelve stock.
  const { data: claimed, error: claimError } = await svc
    .from('orders')
    .update({
      status: 'expired',
      payment_status: 'expired',
      stock_state: 'released',
      refund_reason: 'Reserva vencida sin pago confirmado',
    })
    .in('id', stale.map((order: any) => order.id))
    .eq('status', 'pending_payment')
    .select('id, order_number, offer_id, quantity, merchant_id');
  if (claimError) throw claimError;
  if (!claimed?.length) return 0;

  // 2) Efectos por pedido (liberar stock + evento) en paralelo y con concurrencia acotada.
  //    release_offer_stock es un UPDATE atómico, así que es seguro aun con varias órdenes
  //    de la misma oferta. Un fallo puntual se registra y no aborta el resto del lote.
  const results = await mapSettled(claimed, EXPIRY_CONCURRENCY, async (order: any) => {
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
  });

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      // El pedido ya quedó vencido: el stock pendiente se puede reponer con un ajuste manual.
      console.error('Reserva vencida sin liberar stock:', claimed[index].id, result.reason);
    }
  });

  return claimed.length;
}

/** Máximo de pedidos procesados a la vez al vencer reservas (no satura la base). */
const EXPIRY_CONCURRENCY = 8;

/**
 * Como Promise.allSettled, pero con a lo sumo `limit` tareas en vuelo.
 * Mantiene el orden de los resultados respecto de `items`.
 */
export async function mapSettled<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}

/** Marca publicaciones vencidas: terminó el horario de retiro (offers.pickup_end). */
export async function expireStaleOffers(svc: any) {
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('offers')
    .update({ status: 'expired' })
    .in('status', ['active', 'sold_out'])
    .lt('pickup_end', now)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}