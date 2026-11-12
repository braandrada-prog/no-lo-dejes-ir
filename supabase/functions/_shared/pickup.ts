// deno-lint-ignore-file no-explicit-any
/**
 * Validación de retiro compartida por el panel de administración (redeemOrder) y el
 * panel del comercio (merchantRedeem). El cambio de estado es un compare-and-set: un UPDATE con
 * condición `status = 'paid'` garantiza que un mismo QR no se pueda canjear
 * dos veces aunque dos dispositivos lo escaneen al mismo tiempo.
 *
 * Regla de oro: solo un pedido con pago aprobado puede entregarse. El QR se emite
 * al confirmarse el pago y se borra al cancelar, vencer o reembolsar.
 */
import { commitStock } from './inventory.ts';
import { emitEvent, EVENTS } from './events.ts';

type Svc = any;

export const DEFAULT_PICKUP_TOLERANCE_MINUTES = 30;
const TZ = 'America/Argentina/Buenos_Aires';

/**
 * Busca un pedido por qr_token o por pickup_code.
 * - `merchantIds`: restringe la búsqueda a esos comercios (panel del comercio). Así un
 *   comercio nunca "encuentra" pedidos ajenos, ni siquiera para recibir un error distinto.
 * - pickup_code no es único en la tabla: entre coincidencias se prefiere el pedido
 *   pagado (pendiente de retiro) y, si no hay, el más reciente.
 */
export async function findOrderByCode(svc: Svc, code: string, { merchantIds }: { merchantIds?: string[] } = {}) {
  const scoped = (query: any) => (Array.isArray(merchantIds) ? query.in('merchant_id', merchantIds) : query);

  const { data: byToken, error: tokenError } = await scoped(
    svc.from('orders').select('*').eq('qr_token', code)
  )
    .limit(1)
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (byToken) return byToken;

  const { data: byCode, error: codeError } = await scoped(
    svc.from('orders').select('*').eq('pickup_code', code.toUpperCase())
  )
    .order('created_at', { ascending: false })
    .limit(5);
  if (codeError) throw codeError;
  const rows = byCode ?? [];
  return rows.find((row: any) => row.status === 'paid') || rows[0] || null;
}

/** Datos del pedido que se pueden mostrar al comercio (sin email, QR ni código). */
export function pickupSummary(order: any) {
  if (!order) return null;
  return {
    order_id: order.id,
    order_number: order.order_number || '',
    buyer_name: order.user_name || '',
    offer_title: order.offer_title || '',
    quantity: Number(order.quantity) || 0,
    total: Number(order.total) || 0,
    status: order.status || '',
    pickup_start: order.pickup_start || '',
    pickup_end: order.pickup_end || '',
    redeemed_at: order.redeemed_at || '',
  };
}

function formatArgTime(ms: number) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/**
 * Ventana de retiro con tolerancia. Si el pedido no tiene horario interpretable
 * (pedidos viejos o datos incompletos) NO se bloquea: compatibilidad retroactiva.
 */
export function checkPickupWindow(
  order: any,
  { now = Date.now(), toleranceMinutes = DEFAULT_PICKUP_TOLERANCE_MINUTES }: { now?: number; toleranceMinutes?: number } = {}
) {
  const start = Date.parse(String(order?.pickup_start || ''));
  const end = Date.parse(String(order?.pickup_end || ''));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: true, checked: false };

  const tolerance = Math.max(Number(toleranceMinutes) || 0, 0) * 60 * 1000;
  const opensAt = start - tolerance;
  const closesAt = end + tolerance;
  const window = `${formatArgTime(start)} a ${formatArgTime(end)}`;

  if (now < opensAt) {
    return {
      ok: false,
      checked: true,
      reason: 'too_early',
      message: `Todavía no es el horario de retiro (${window}). Se puede validar desde las ${formatArgTime(opensAt)}.`,
    };
  }
  if (now > closesAt) {
    return {
      ok: false,
      checked: true,
      reason: 'too_late',
      message: `El horario de retiro terminó (${window}). El margen de tolerancia venció a las ${formatArgTime(closesAt)}.`,
    };
  }
  return { ok: true, checked: true };
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

/**
 * Opciones (todas opcionales; sin ellas el comportamiento es el histórico del admin):
 *  - merchantIds: comercios del usuario. Búsqueda acotada y pertenencia ESTRICTA
 *    (un pedido sin merchant_id o de otro comercio se trata como inexistente).
 *  - enforceWindow / toleranceMinutes: rechaza fuera del horario de retiro ± tolerancia.
 */
export async function redeemOrderByCode(
  svc: Svc,
  {
    code,
    actorEmail,
    actorRole,
    channel = 'merchant_app',
    merchantId,
    branchIds,
    merchantIds,
    enforceWindow = false,
    toleranceMinutes = DEFAULT_PICKUP_TOLERANCE_MINUTES,
  }: any
) {
  const clean = String(code || '').trim();
  if (!clean) return { status: 400, body: { error: 'Falta el código o el QR.' } };

  const strictIds: string[] | undefined = Array.isArray(merchantIds) ? merchantIds.map(String) : undefined;
  const found = await findOrderByCode(svc, clean, { merchantIds: strictIds });
  const order = found && strictIds && !strictIds.includes(String(found.merchant_id || '')) ? null : found;
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
        summary: pickupSummary(order),
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
        summary: pickupSummary(order),
      },
    };
  }

  if (enforceWindow) {
    const window = checkPickupWindow(order, { toleranceMinutes });
    if (!window.ok) {
      await logAttempt(svc, {
        actorEmail,
        actorRole,
        channel,
        code: clean,
        order,
        detail: `Intento de retiro fuera de horario (${window.reason})`,
        action: 'order.redeem_failed',
      });
      return {
        status: 409,
        body: {
          error: window.message,
          code: 'outside_pickup_window',
          reason: window.reason,
          tolerance_minutes: toleranceMinutes,
          summary: pickupSummary(order),
        },
      };
    }
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

  return { status: 200, body: { ok: true, order: updated, summary: pickupSummary(updated) } };
}