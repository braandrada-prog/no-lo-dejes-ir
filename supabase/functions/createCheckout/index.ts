// deno-lint-ignore-file no-explicit-any
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, getAuthedUser, readSecret } from '../_shared/auth.ts';
import { mpCreatePreference, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { reserveStock } from '../_shared/inventory.ts';
import { resolveCommission, computeFees } from '../_shared/commissions.ts';
import { emitEvent, EVENTS } from '../_shared/events.ts';
import { logTransaction } from '../_shared/payments.ts';
import {
  buildOrderNumber,
  buildPickupCode,
  reservationDeadline,
  restockOffer,
  expireStaleReservations,
} from '../_shared/reservations.ts';

function previousResponse(previous: any) {
  return json({
    order_id: previous.id,
    order_number: previous.order_number,
    init_point: previous.init_point || '',
    status: previous.status,
    total: previous.total,
    quantity: previous.quantity,
    reserved_until: previous.reserved_until || '',
    pickup_date: previous.pickup_date || '',
    pickup_start: previous.pickup_start || '',
    pickup_end: previous.pickup_end || '',
    business_name: previous.business_name || '',
    business_address: previous.business_address || '',
    payment_environment: previous.payment_environment || 'test',
    duplicate: true,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const svc = adminClient();
    const user = await getAuthedUser(req, svc);
    if (!user) {
      return json({ error: 'auth_required', message: 'Necesitás iniciar sesión para comprar.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offer_id || '').trim();
    const quantity = Math.min(Math.max(Number(body.quantity) || 1, 1), 5);
    const idempotencyKey = String(body.idempotency_key || '').trim();

    if (!offerId) return json({ error: 'Falta la oferta.' }, 400);
    if (idempotencyKey.length < 8) return json({ error: 'Solicitud inválida.' }, 400);

    // Idempotencia: reintentos del mismo checkout devuelven la misma reserva.
    const { data: previous } = await svc
      .from('orders')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .eq('user_email', user.email)
      .limit(1)
      .maybeSingle();
    if (previous) return previousResponse(previous);

    const mp = await resolveMpEnvironment(svc, readSecret);
    if (!mp.ready) {
      return json(
        {
          error: 'payments_not_configured',
          environment: mp.environment,
          message:
            'El cobro con Mercado Pago todavía no está configurado para este entorno. El administrador debe cargar las credenciales.',
        },
        503
      );
    }

    await expireStaleReservations(svc);

    const { data: offer, error: offerError } = await svc
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .maybeSingle();
    if (offerError) throw offerError;
    if (!offer) return json({ error: 'La oferta no existe.' }, 404);
    if (offer.status !== 'active') {
      return json({ error: 'La oferta ya no está disponible.', code: 'unavailable' }, 409);
    }
    if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
      return json({ error: 'La oferta venció.', code: 'expired' }, 409);
    }
    if ((Number(offer.quantity_available) || 0) < quantity) {
      return json(
        {
          error: 'No quedan suficientes paquetes disponibles.',
          code: 'stock',
          available: Number(offer.quantity_available) || 0,
        },
        409
      );
    }

    const orderNumber = buildOrderNumber();
    const reservedUntil = reservationDeadline();

    // Bloqueo temporal del stock: atómico, nadie más puede quedarse con estas unidades.
    const reservation = await reserveStock(svc, {
      offer,
      quantity,
      orderRef: orderNumber,
      actorEmail: user.email,
    });
    if (!reservation.ok) {
      return json(
        {
          error: 'Alguien tomó esas unidades primero. Probá con otra cantidad.',
          code: 'stock',
          available: reservation.available,
        },
        409
      );
    }

    const { data: profile } = await svc
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle();

    const unitPrice = Number(offer.rescue_price);
    const total = unitPrice * quantity;
    const savings = Math.max(Number(offer.original_price) - unitPrice, 0) * quantity;
    const commission = await resolveCommission(svc, offer.merchant_id);
    const fees = computeFees(total, commission);

    const { data: order, error: insertError } = await svc
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_email: user.email,
        user_name: profile?.full_name || '',
        user_phone: profile?.phone || '',
        offer_id: offer.id,
        offer_title: offer.title,
        image_url: offer.image_url || '',
        business_id: offer.business_id || null,
        merchant_id: offer.merchant_id || null,
        branch_id: offer.branch_id || null,
        business_name: offer.business_name || '',
        business_address: offer.business_address || '',
        business_phone: offer.business_phone || '',
        city: offer.city || '',
        quantity,
        unit_price: unitPrice,
        total,
        savings,
        commission_rate: fees.rate,
        commission_amount: fees.commission,
        net_to_merchant: fees.net,
        settlement_status: 'accrued',
        stock_state: 'reserved',
        status: 'pending_payment',
        payment_provider: 'mercadopago',
        payment_environment: mp.environment,
        payment_status: 'pending',
        pickup_date: offer.pickup_date || null,
        pickup_start: offer.pickup_start || null,
        pickup_end: offer.pickup_end || null,
        pickup_code: buildPickupCode(),
        // El QR de retiro NO se crea acá: se emite recién con el pago aprobado.
        qr_token: null,
        reserved_until: reservedUntil,
        idempotency_key: idempotencyKey,
        refund_required: false,
        created_by_id: user.id,
      })
      .select()
      .single();

    if (insertError || !order) {
      await restockOffer(svc, offer.id, quantity, { reason: 'Error al crear el pedido' });

      // Dos clics simultáneos con la misma clave: el índice único deja pasar a uno solo.
      if (insertError?.code === '23505') {
        const { data: duplicate } = await svc
          .from('orders')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .eq('user_email', user.email)
          .maybeSingle();
        if (duplicate) return previousResponse(duplicate);
      }
      throw insertError || new Error('No se pudo crear el pedido.');
    }

    // URL pública del frontend (back_urls de Mercado Pago). Configurala con:
    //   supabase secrets set APP_URL=https://tu-dominio.com
    const origin = (readSecret('APP_URL') || req.headers.get('origin') || '').replace(/\/$/, '');

    const preference = await mpCreatePreference({
      token: mp.token,
      environment: mp.environment,
      order,
      origin,
    });

    if (!preference.ok || !preference.init_point) {
      await restockOffer(svc, offer.id, quantity, { orderId: order.id, reason: 'No se pudo iniciar el pago' });
      await svc
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'error',
          stock_state: 'released',
          settlement_status: 'void',
          refund_reason: 'No se pudo iniciar el pago',
        })
        .eq('id', order.id);
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: order.id,
        order_number: order.order_number,
        provider_status: 'error',
        amount: total,
        dedupe_key: `order:${order.id}:preference:error`,
        source: 'checkout',
        actor_email: user.email,
        detail: `${preference.error || 'preference_failed'} ${JSON.stringify(preference.detail || {}).slice(0, 400)}`,
      });
      return json(
        {
          error: 'payment_start_failed',
          code: preference.connectionError ? 'connection' : 'provider',
          message: preference.connectionError
            ? 'No pudimos conectar con Mercado Pago. No se cobró nada: probá de nuevo en unos minutos.'
            : 'No pudimos iniciar el pago. No se cobró nada: probá de nuevo.',
        },
        502
      );
    }

    const { error: prefUpdateError } = await svc
      .from('orders')
      .update({
        preference_id: preference.preference_id || '',
        payment_id: '',
        init_point: preference.init_point,
      })
      .eq('id', order.id);
    if (prefUpdateError) throw prefUpdateError;

    await logTransaction(svc, {
      environment: mp.environment,
      kind: 'preference_created',
      order_id: order.id,
      order_number: order.order_number,
      preference_id: preference.preference_id || '',
      provider_status: 'pending',
      amount: total,
      dedupe_key: `order:${order.id}:preference:${preference.preference_id || ''}`,
      source: 'checkout',
      actor_email: user.email,
      detail: 'Preferencia de checkout creada',
    });

    await emitEvent(
      svc,
      EVENTS.orderCreated,
      {
        order_id: order.id,
        order_number: order.order_number,
        offer_id: order.offer_id,
        merchant_id: order.merchant_id,
        branch_id: order.branch_id,
        quantity: order.quantity,
        total: order.total,
        commission_amount: order.commission_amount,
        net_to_merchant: order.net_to_merchant,
        pickup_date: order.pickup_date,
        pickup_start: order.pickup_start,
        pickup_end: order.pickup_end,
        payment_environment: mp.environment,
      },
      { merchantId: order.merchant_id, orderId: order.id }
    );

    return json({
      order_id: order.id,
      order_number: order.order_number,
      init_point: preference.init_point,
      status: 'pending_payment',
      total,
      quantity,
      reserved_until: reservedUntil,
      pickup_date: order.pickup_date,
      pickup_start: order.pickup_start,
      pickup_end: order.pickup_end,
      business_name: order.business_name,
      business_address: order.business_address,
      payment_environment: mp.environment,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});