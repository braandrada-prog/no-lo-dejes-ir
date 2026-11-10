// deno-lint-ignore-file no-explicit-any
/**
 * Control transaccional de inventario.
 *
 * Cada operación que cambia unidades llama a una función SQL (ver
 * supabase/migrations/20261106000000_inventory_and_events.sql) que hace un UPDATE
 * condicional atómico: aplica el cambio solo si la condición sigue siendo cierta en ese
 * instante y devuelve cero filas si no. Eso es lo que impide que dos consumidores
 * compren la última unidad a la vez.
 */

type Svc = any;

function int(value: unknown) {
  return Math.max(Math.trunc(Number(value) || 0), 1);
}

async function getOffer(svc: Svc, offerId: string) {
  const { data } = await svc.from('offers').select('*').eq('id', offerId).maybeSingle();
  return data ?? null;
}

export async function recordMovement(svc: Svc, movement: any) {
  return logMovement(svc, movement);
}

async function logMovement(svc: Svc, movement: any) {
  // El registro de inventario no debe tumbar la venta.
  const { error } = await svc.from('stock_movements').insert({
    offer_id: movement.offer_id || null,
    merchant_id: movement.merchant_id || null,
    branch_id: movement.branch_id || null,
    order_id: movement.order_id || null,
    type: movement.type,
    quantity: movement.quantity,
    resulting_available: movement.resulting_available ?? 0,
    reason: movement.reason || '',
    actor_email: movement.actor_email || 'system',
  });
  if (error) console.error('No se pudo registrar el movimiento de stock:', error);
}

/**
 * Retiene unidades para un pedido pendiente de pago.
 * Devuelve { ok, available } o { ok: false, available } si otro consumidor ganó.
 */
export async function reserveStock(
  svc: Svc,
  { offer, quantity, orderId, orderRef, actorEmail }: any
) {
  const qty = int(quantity);

  const { data, error } = await svc.rpc('reserve_offer_stock', { p_offer_id: offer.id, p_qty: qty });
  if (error) throw error;

  const refreshed = data?.[0];
  if (!refreshed) {
    const current = await getOffer(svc, offer.id);
    return { ok: false, available: Number(current?.quantity_available) || 0 };
  }

  const available = Number(refreshed.quantity_available) || 0;

  await logMovement(svc, {
    offer_id: offer.id,
    merchant_id: refreshed.merchant_id,
    branch_id: refreshed.branch_id,
    order_id: orderId,
    type: 'reservation',
    quantity: -qty,
    resulting_available: available,
    reason: orderRef ? `Reserva del pedido ${orderRef}` : 'Reserva para pedido pendiente de pago',
    actor_email: actorEmail,
  });

  if (available <= 0 && refreshed.status === 'active') {
    await svc.from('offers').update({ status: 'sold_out' }).eq('id', offer.id);
  }

  return { ok: true, available };
}

/** Confirma la venta: las unidades dejan de estar retenidas (ya salieron del stock). */
export async function commitStock(
  svc: Svc,
  { offerId, quantity, orderId, actorEmail, merchantId, branchId }: any
) {
  const qty = int(quantity);

  const { data: applied, error } = await svc.rpc('commit_reserved_units', {
    p_offer_id: offerId,
    p_qty: qty,
  });
  if (error) throw error;

  const current = await getOffer(svc, offerId);
  await logMovement(svc, {
    offer_id: offerId,
    merchant_id: merchantId || current?.merchant_id,
    branch_id: branchId || current?.branch_id,
    order_id: orderId,
    type: 'sale',
    quantity: 0,
    resulting_available: Number(current?.quantity_available) || 0,
    reason: applied ? 'Pago confirmado' : 'Pago confirmado (reserva sin retención previa)',
    actor_email: actorEmail,
  });
  return { ok: true };
}

/** Devuelve unidades al stock (reserva vencida, pago rechazado, cancelación, reembolso). */
export async function releaseStock(
  svc: Svc,
  { offerId, quantity, orderId, actorEmail, reason, type = 'release', merchantId, branchId }: any
) {
  const qty = int(quantity);

  const { data, error } = await svc.rpc('release_offer_stock', { p_offer_id: offerId, p_qty: qty });
  if (error) throw error;

  const current = data?.[0];
  if (!current) return { ok: false, available: 0 };

  const available = Number(current.quantity_available) || 0;

  if (current.status === 'sold_out' && available > 0) {
    const stillValid = !current.expires_at || new Date(current.expires_at).getTime() > Date.now();
    await svc.from('offers').update({ status: stillValid ? 'active' : 'expired' }).eq('id', offerId);
  }

  await logMovement(svc, {
    offer_id: offerId,
    merchant_id: merchantId || current.merchant_id,
    branch_id: branchId || current.branch_id,
    order_id: orderId,
    type,
    quantity: qty,
    resulting_available: available,
    reason,
    actor_email: actorEmail,
  });

  return { ok: true, available };
}

/** Ajuste manual de stock desde la app de comerciantes o el panel. */
export async function adjustStock(svc: Svc, { offerId, delta, actorEmail, reason }: any) {
  const value = Math.trunc(Number(delta) || 0);
  if (!value) return { ok: false, error: 'El ajuste no puede ser 0.' };

  const current = await getOffer(svc, offerId);
  if (!current) return { ok: false, error: 'Publicación inexistente.' };

  const available = Number(current.quantity_available) || 0;
  if (available + value < 0) {
    return { ok: false, error: `Solo hay ${available} unidades disponibles.` };
  }

  const { data, error } = await svc.rpc('adjust_offer_stock', { p_offer_id: offerId, p_delta: value });
  if (error) throw error;

  const refreshed = data?.[0];
  if (!refreshed) return { ok: false, error: 'No se pudo aplicar el ajuste.' };

  const resulting = Number(refreshed.quantity_available) || 0;
  if (value > 0 && refreshed.status === 'sold_out') {
    await svc.from('offers').update({ status: 'active' }).eq('id', offerId);
  }

  await logMovement(svc, {
    offer_id: offerId,
    merchant_id: refreshed.merchant_id,
    branch_id: refreshed.branch_id,
    type: 'adjustment',
    quantity: value,
    resulting_available: resulting,
    reason: reason || 'Ajuste manual de stock',
    actor_email: actorEmail,
  });

  return { ok: true, available: resulting };
}

/** Unidades retenidas por pedidos pendientes de pago hoy. */
export async function pendingUnits(svc: Svc, offerId: string) {
  const { data, error } = await svc
    .from('orders')
    .select('quantity')
    .eq('offer_id', offerId)
    .eq('status', 'pending_payment')
    .limit(100);
  if (error) throw error;

  return (data ?? []).reduce((sum: number, order: any) => sum + (Number(order.quantity) || 0), 0);
}