// deno-lint-ignore-file no-explicit-any
/**
 * Núcleo de confirmación de pagos y reembolsos.
 *
 * Toda transición provocada por el proveedor pasa por acá: webhook, conciliación
 * manual, simulación de pruebas y reembolsos. Reglas duras:
 *
 *  1. El QR de retiro (qr_token) SOLO existe cuando el pago está aprobado.
 *     Se genera en la confirmación y se borra al cancelar, vencer o reembolsar.
 *  2. La transición de estado es un compare-and-set (UPDATE con condición sobre el
 *     estado actual): dos webhooks simultáneos no pueden confirmar dos veces ni
 *     devolver stock dos veces.
 *  3. Todo movimiento queda registrado en payment_transactions (auditoría + idempotencia).
 */
import { buildPickupCode, buildQrToken, restockOffer } from './reservations.ts';
import { commitStock, reserveStock } from './inventory.ts';
import { emitEvent, EVENTS } from './events.ts';

type Svc = any;

const MAX_DETAIL = 1500;

function truncate(value: unknown, max = MAX_DETAIL) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ── Helpers de acceso a pedidos ───────────────────────────────────────────────

async function getOrder(svc: Svc, id: string) {
  const { data } = await svc.from('orders').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

async function updateOrder(svc: Svc, id: string, fields: Record<string, unknown>) {
  const { error } = await svc.from('orders').update(fields).eq('id', id);
  if (error) throw error;
}

/** Compare-and-set: aplica `fields` solo si el pedido sigue en `fromStatus`. Devuelve la fila o null. */
async function claimOrder(svc: Svc, id: string, fromStatus: string, fields: Record<string, unknown>) {
  const { data, error } = await svc
    .from('orders')
    .update(fields)
    .eq('id', id)
    .eq('status', fromStatus)
    .select();
  if (error) throw error;
  return data?.[0] ?? null;
}

// ── Registro, notificaciones y auditoría (nunca cortan la operación) ──────────

export async function logTransaction(svc: Svc, tx: any) {
  const { data, error } = await svc
    .from('payment_transactions')
    .insert({
      provider: tx.provider || 'mercadopago',
      environment: tx.environment || 'test',
      kind: tx.kind,
      order_id: tx.order_id || null,
      order_number: tx.order_number || '',
      payment_id: tx.payment_id ? String(tx.payment_id) : '',
      preference_id: tx.preference_id || '',
      provider_status: tx.provider_status || '',
      provider_status_detail: tx.provider_status_detail || '',
      amount: Number(tx.amount) || 0,
      currency: tx.currency || 'ARS',
      dedupe_key: tx.dedupe_key || null,
      source: tx.source || 'system',
      actor_email: tx.actor_email || '',
      detail: truncate(tx.detail),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('No se pudo registrar la transacción:', error);
    return null;
  }
  return data;
}

export async function alreadyLogged(svc: Svc, dedupeKey: string) {
  if (!dedupeKey) return false;
  const { data, error } = await svc
    .from('payment_transactions')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function notify(svc: Svc, payload: any) {
  const { error } = await svc.from('notifications').insert(payload);
  if (error) console.error('No se pudo crear la notificación:', error);
}

async function audit(svc: Svc, payload: any) {
  const { error } = await svc.from('audit_logs').insert({
    ...payload,
    entity_id: payload.entity_id || null,
    merchant_id: payload.merchant_id || null,
    branch_id: payload.branch_id || null,
  });
  if (error) console.error('No se pudo registrar la auditoría:', error);
}

function pickupText(order: any) {
  return `Retirá tu paquete en ${order.business_name || 'el comercio'}${
    order.pickup_date ? ` el ${order.pickup_date}` : ''
  } de ${order.pickup_start || '--:--'} a ${order.pickup_end || '--:--'}.`;
}

// ── Confirmación de pago ──────────────────────────────────────────────────────

async function confirmPaid(svc: Svc, order: any, payment: any, { environment, source, actorEmail }: any) {
  const paymentId = String(payment.id || '');
  const qrToken = buildQrToken();
  const now = new Date().toISOString();

  const claimed = await claimOrder(svc, order.id, order.status, {
    status: 'paid',
    payment_status: 'approved',
    payment_id: paymentId,
    payment_method: payment.payment_method_id || '',
    payment_environment: environment,
    paid_at: now,
    stock_state: 'committed',
    settlement_status: 'accrued',
    qr_token: qrToken,
    qr_issued_at: now,
    pickup_code: order.pickup_code || buildPickupCode(),
    refund_required: false,
    last_reconciled_at: now,
  });

  if (!claimed) {
    return { status: 'race_lost', order: await getOrder(svc, order.id) };
  }

  await commitStock(svc, {
    offerId: order.offer_id,
    quantity: order.quantity,
    orderId: order.id,
    actorEmail,
    merchantId: order.merchant_id,
    branchId: order.branch_id,
  });

  await emitEvent(
    svc,
    EVENTS.paymentApproved,
    {
      order_id: order.id,
      order_number: order.order_number,
      merchant_id: order.merchant_id || '',
      branch_id: order.branch_id || '',
      total: order.total,
      commission_amount: order.commission_amount || 0,
      net_to_merchant: order.net_to_merchant || 0,
      payment_id: paymentId,
      payment_method: payment.payment_method_id || '',
      environment,
    },
    { merchantId: order.merchant_id, orderId: order.id }
  );

  await notify(svc, {
    user_email: order.user_email,
    title: 'Pago confirmado',
    message: `Tu reserva ${order.order_number} quedó confirmada y ya tenés tu código QR de retiro. ${pickupText(
      order
    )}`,
    type: 'payment',
    link: `/compras/${order.id}`,
  });

  await audit(svc, {
    actor_email: actorEmail || 'system',
    actor_role: 'system',
    source: source === 'webhook' ? 'webhook' : 'system',
    action: 'order.paid',
    target: order.order_number,
    entity: 'Order',
    entity_id: order.id,
    merchant_id: order.merchant_id,
    branch_id: order.branch_id,
    details: `Pago aprobado (${environment}) · ${paymentId}`,
  });

  await logTransaction(svc, {
    environment,
    kind: 'status_applied',
    order_id: order.id,
    order_number: order.order_number,
    payment_id: paymentId,
    provider_status: 'approved',
    provider_status_detail: payment.status_detail || '',
    amount: order.total,
    dedupe_key: `order:${order.id}:payment:${paymentId}:approved`,
    source,
    actor_email: actorEmail,
    detail: 'Reserva confirmada y QR de retiro emitido',
  });

  return { status: 'paid', order: claimed };
}

/**
 * Aplica el estado de un pago del proveedor a un pedido.
 * Devuelve { status } con el resultado lógico de la operación.
 */
export async function applyPayment(
  svc: Svc,
  { order, payment, environment, source = 'webhook', actorEmail }: any
): Promise<any> {
  const paymentId = String(payment?.id || '');
  const providerStatus = String(payment?.status || '').toLowerCase();
  const statusDetail = String(payment?.status_detail || '');
  const amount = Number(payment?.transaction_amount) || 0;

  const current = (await getOrder(svc, order.id)) || order;

  await logTransaction(svc, {
    environment,
    kind: 'status_applied',
    order_id: current.id,
    order_number: current.order_number,
    payment_id: paymentId,
    provider_status: providerStatus,
    provider_status_detail: statusDetail,
    amount,
    dedupe_key: `sync:${current.id}:${paymentId}:${providerStatus}:${statusDetail}`,
    source,
    actor_email: actorEmail,
    detail: `Estado informado por el proveedor: ${providerStatus}`,
  });

  // ── Pago aprobado ────────────────────────────────────────────────────────────
  if (providerStatus === 'approved') {
    if (current.status === 'paid' || current.status === 'picked_up') {
      if (current.payment_id && current.payment_id !== paymentId) {
        // Cobro duplicado: se registra para reembolso y NO se altera la reserva.
        await updateOrder(svc, current.id, {
          refund_required: true,
          duplicate_payment_ids: [...(current.duplicate_payment_ids || []), paymentId],
          refund_reason: `Pago duplicado detectado (${paymentId})`,
        });
        await logTransaction(svc, {
          environment,
          kind: 'duplicate_payment',
          order_id: current.id,
          order_number: current.order_number,
          payment_id: paymentId,
          provider_status: providerStatus,
          amount,
          dedupe_key: `order:${current.id}:payment:${paymentId}:duplicate`,
          source,
          actor_email: actorEmail,
          detail: `El pedido ya estaba pagado con ${current.payment_id}`,
        });
        await notify(svc, {
          user_email: current.user_email,
          title: 'Pago duplicado',
          message: `Detectamos un segundo cobro para tu pedido ${current.order_number}. Lo estamos reintegrando.`,
          type: 'payment',
          link: `/compras/${current.id}`,
        });
        return { status: 'duplicate_payment', order: current };
      }
      return { status: 'already_paid', order: current };
    }

    if (current.status === 'pending_payment') {
      return await confirmPaid(svc, current, payment, { environment, source, actorEmail });
    }

    // Reserva vencida o cancelada: el pago llegó tarde. Se intenta recomprar el stock.
    if (current.status === 'expired' || current.status === 'cancelled') {
      const { data: offer } = await svc.from('offers').select('*').eq('id', current.offer_id).maybeSingle();
      const reservation = offer
        ? await reserveStock(svc, {
            offer,
            quantity: current.quantity,
            orderId: current.id,
            orderRef: current.order_number,
            actorEmail: actorEmail || 'mpWebhook',
          })
        : { ok: false, available: 0 };

      if (reservation.ok) {
        const recovered = await confirmPaid(svc, current, payment, { environment, source, actorEmail });
        await logTransaction(svc, {
          environment,
          kind: 'reconcile',
          order_id: current.id,
          order_number: current.order_number,
          payment_id: paymentId,
          provider_status: providerStatus,
          amount,
          dedupe_key: `order:${current.id}:payment:${paymentId}:recovered`,
          source,
          actor_email: actorEmail,
          detail: 'Pago aprobado después del vencimiento: stock recuperado y reserva reabierta',
        });
        return { ...recovered, status: 'paid_recovered' };
      }

      await updateOrder(svc, current.id, {
        payment_status: 'approved',
        payment_id: paymentId,
        payment_environment: environment,
        refund_required: true,
        refund_reason: 'Pago aprobado sin stock disponible: requiere reembolso',
      });
      await logTransaction(svc, {
        environment,
        kind: 'oversold_payment',
        order_id: current.id,
        order_number: current.order_number,
        payment_id: paymentId,
        provider_status: providerStatus,
        amount,
        dedupe_key: `order:${current.id}:payment:${paymentId}:oversold`,
        source,
        actor_email: actorEmail,
        detail: 'Sin stock para honrar la reserva vencida',
      });
      await notify(svc, {
        user_email: current.user_email,
        title: 'Te devolvemos el pago',
        message: `Recibimos tu pago del pedido ${current.order_number}, pero la reserva había vencido y no queda stock. Estamos procesando el reintegro.`,
        type: 'payment',
        link: `/compras/${current.id}`,
      });
      return { status: 'refund_required', order: current };
    }

    return { status: 'not_applicable', order: current };
  }

  // ── Pago pendiente / en proceso ──────────────────────────────────────────────
  if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(providerStatus)) {
    if (current.status === 'pending_payment') {
      await updateOrder(svc, current.id, {
        payment_status: providerStatus,
        payment_id: paymentId,
        payment_environment: environment,
        last_reconciled_at: new Date().toISOString(),
      });
    }
    return { status: 'pending', order: current };
  }

  // ── Pago rechazado o cancelado ───────────────────────────────────────────────
  // En Checkout Pro el comprador puede reintentar con otro medio sobre la misma
  // preferencia, así que un rechazo NO cancela la reserva ni libera stock: el pedido
  // sigue en pending_payment hasta que se paga o vence reserved_until (expireStaleReservations).
  if (providerStatus === 'rejected' || providerStatus === 'cancelled') {
    if (current.status === 'pending_payment') {
      await updateOrder(svc, current.id, {
        payment_status: providerStatus,
        payment_environment: environment,
        last_reconciled_at: new Date().toISOString(),
      });

      const dedupeKey = `order:${current.id}:payment:${paymentId}:${providerStatus}:notified`;
      if (!(await alreadyLogged(svc, dedupeKey))) {
        await emitEvent(
          svc,
          EVENTS.paymentRejected,
          {
            order_id: current.id,
            order_number: current.order_number,
            merchant_id: current.merchant_id || '',
            total: current.total,
            status: providerStatus,
            status_detail: statusDetail,
          },
          { merchantId: current.merchant_id, orderId: current.id }
        );
        await notify(svc, {
          user_email: current.user_email,
          title: providerStatus === 'rejected' ? 'Pago rechazado' : 'Pago cancelado',
          message: `No pudimos aprobar el pago de tu reserva ${current.order_number}. Mantenemos las unidades reservadas por unos minutos: podés reintentar con otro medio de pago.`,
          type: 'payment',
          link: `/compras/${current.id}`,
        });
        await logTransaction(svc, {
          environment,
          kind: 'status_applied',
          order_id: current.id,
          order_number: current.order_number,
          payment_id: paymentId,
          provider_status: providerStatus,
          provider_status_detail: statusDetail,
          amount,
          dedupe_key: dedupeKey,
          source,
          actor_email: actorEmail,
          detail: 'Pago no aprobado: la reserva se mantiene hasta su vencimiento',
        });
      }
      return { status: 'pending', order: current };
    }
    // Un pedido ya pagado no se cancela por un webhook de rechazo.
    return { status: 'ignored', order: current };
  }

  // ── Reembolso o contracargo informado por el proveedor ───────────────────────
  if (providerStatus === 'refunded' || providerStatus === 'charged_back') {
    return applyRefund(svc, {
      order: current,
      paymentId,
      amount: Number(payment?.transaction_amount_refunded) || amount || current.total,
      reason: statusDetail || (providerStatus === 'charged_back' ? 'Contracargo' : 'Reembolso'),
      environment,
      source,
      actorEmail,
    });
  }

  return { status: 'unhandled', order: current };
}

// ── Reembolso ─────────────────────────────────────────────────────────────────

/** Registra un reembolso, devuelve el stock si el paquete no se retiró y anula el QR. */
export async function applyRefund(
  svc: Svc,
  { order, paymentId, amount, reason, environment = 'test', source = 'admin', actorEmail }: any
): Promise<any> {
  const current = (await getOrder(svc, order.id)) || order;

  if (current.status === 'refunded') {
    return { status: 'already_refunded', order: current };
  }

  const wasDelivered = current.status === 'picked_up';
  const now = new Date().toISOString();

  const claimed = await claimOrder(svc, current.id, current.status, {
    status: 'refunded',
    payment_status: 'refunded',
    refunded_at: now,
    refunded_amount: Number(amount) || Number(current.total) || 0,
    refund_reason: String(reason || '').slice(0, 280) || 'Reembolso',
    payment_id: paymentId || current.payment_id || '',
    payment_environment: environment,
    settlement_status: 'void',
    refund_required: false,
    qr_token: null,
    stock_state: 'released',
    last_reconciled_at: now,
  });

  if (!claimed) {
    return { status: 'race_lost', order: await getOrder(svc, current.id) };
  }

  // El paquete no se retiró: vuelve al stock. Si ya se entregó, no se repone comida.
  if (!wasDelivered) {
    await restockOffer(svc, current.offer_id, current.quantity, {
      orderId: current.id,
      reason: 'Reembolso',
      type: 'release',
      actorEmail: actorEmail || 'system',
    });
  }

  await emitEvent(
    svc,
    EVENTS.orderRefunded,
    {
      order_id: current.id,
      order_number: current.order_number,
      merchant_id: current.merchant_id || '',
      total: current.total,
      amount: Number(amount) || current.total,
      reason,
      environment,
    },
    { merchantId: current.merchant_id, orderId: current.id }
  );

  await notify(svc, {
    user_email: current.user_email,
    title: 'Reembolso procesado',
    message: `Reintegramos ${Number(amount) || current.total} de tu pedido ${current.order_number}. Puede tardar algunos días en verse en tu tarjeta.`,
    type: 'payment',
    link: `/compras/${current.id}`,
  });

  await audit(svc, {
    actor_email: actorEmail || 'system',
    actor_role: 'system',
    source: source === 'webhook' ? 'webhook' : 'admin_panel',
    action: 'order.refund',
    target: current.order_number,
    entity: 'Order',
    entity_id: current.id,
    merchant_id: current.merchant_id,
    details: `${reason || 'Reembolso'} · ${Number(amount) || current.total}`,
  });

  await logTransaction(svc, {
    environment,
    kind: 'refund_applied',
    order_id: current.id,
    order_number: current.order_number,
    payment_id: paymentId || current.payment_id || '',
    provider_status: 'refunded',
    amount: Number(amount) || current.total,
    dedupe_key: `order:${current.id}:refund:${paymentId || current.payment_id || 'manual'}`,
    source,
    actor_email: actorEmail,
    detail: reason || 'Reembolso',
  });

  return { status: 'refunded', order: claimed };
}