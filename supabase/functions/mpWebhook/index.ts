// deno-lint-ignore-file no-explicit-any
import { json } from '../_shared/cors.ts';
import { adminClient, readSecret } from '../_shared/auth.ts';
import { mpGetPayment, mpSignatureValid, resolveMpEnvironment, MP_ENVIRONMENTS } from '../_shared/mpConfig.ts';
import { findAccountByMpUserId, getMerchantCredentials, resolveOrderToken } from '../_shared/merchantMp.ts';
import { applyPayment, logTransaction } from '../_shared/payments.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getOrder(svc: any, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await svc.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Notificación de Mercado Pago (modelo Marketplace).
 *
 * Se despliega con verify_jwt = false (Mercado Pago no envía JWT de Supabase).
 * La seguridad la dan estos controles:
 *
 * 1. Firma HMAC del webhook con el secreto del entorno (obligatoria en producción).
 * 2. Nunca se confía en el cuerpo: se consulta el pago real a la API de Mercado Pago
 *    con el token del COMERCIO que cobró (el pago pertenece a su cuenta).
 * 3. Se verifica pedido, cobrador (collector_id), moneda y monto antes de confirmar.
 * 4. La aplicación del estado es idempotente (compare-and-set + payment_transactions).
 *
 * Para saber qué token usar: la notification_url lleva ?order=<id> (pedidos nuevos);
 * si no está, se usa el user_id del cuerpo (cuenta del comercio) o, para pedidos
 * históricos, el token de la plataforma.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return json({ ok: true });
  }

  try {
    const svc = adminClient();

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const topic = String(
      body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || ''
    );
    const paymentId = String(
      url.searchParams.get('data.id') || body?.data?.id || url.searchParams.get('id') || body?.id || ''
    ).trim();

    if (topic !== 'payment' || !paymentId) {
      return json({ ok: true, ignored: true });
    }

    const hintOrder = await getOrder(svc, String(url.searchParams.get('order') || ''));
    const sellerUserId = String(body?.user_id || '').trim();

    // Entorno: el del pedido; si no hay pedido, el que informa Mercado Pago; si no, el activo.
    const liveMode = body?.live_mode;
    const environmentHint = hintOrder?.payment_environment && MP_ENVIRONMENTS.includes(hintOrder.payment_environment)
      ? hintOrder.payment_environment
      : liveMode === true
        ? 'production'
        : liveMode === false
          ? 'test'
          : undefined;
    const mp = await resolveMpEnvironment(svc, readSecret, environmentHint);

    const signature = await mpSignatureValid({
      signature: req.headers.get('x-signature') || '',
      requestId: req.headers.get('x-request-id') || '',
      dataId: paymentId,
      secret: mp.webhookSecret,
      environment: mp.environment,
    });

    if (!signature.ok) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: hintOrder?.id,
        payment_id: paymentId,
        provider_status: 'invalid_signature',
        dedupe_key: `webhook:${paymentId}:invalid_signature:${Date.now()}`,
        source: 'webhook',
        detail: signature.enforced
          ? 'Firma del webhook inválida: notificación descartada'
          : 'Falta el secreto del webhook en producción: notificación descartada',
      });
      return json({ error: 'Firma inválida' }, 401);
    }

    // ── Token con el que se consulta el pago ─────────────────────────────────────
    let credentials: any;
    if (hintOrder) {
      credentials = await resolveOrderToken(svc, hintOrder, mp);
    } else if (sellerUserId) {
      const account = await findAccountByMpUserId(svc, sellerUserId, mp.environment);
      credentials = account
        ? { ...(await getMerchantCredentials(svc, account.business_id, mp.environment, { mp })), source: 'merchant' }
        : { ok: Boolean(mp.token), token: mp.token, source: 'platform', reason: 'unknown_seller' };
    } else {
      credentials = { ok: Boolean(mp.token), token: mp.token, source: 'platform', reason: 'platform_token_missing' };
    }

    if (!credentials?.ok) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: hintOrder?.id,
        order_number: hintOrder?.order_number,
        payment_id: paymentId,
        provider_status: 'token_unavailable',
        dedupe_key: `webhook:${paymentId}:token:${credentials?.reason || 'unknown'}`,
        source: 'webhook',
        detail: `Sin token para verificar el pago (${credentials?.source}: ${credentials?.reason || 'desconocido'})`,
      });
      // 503: Mercado Pago reintenta. La conciliación también lo recupera más tarde.
      return json({ error: 'No se pudo verificar el pago' }, 503);
    }

    // Verificación de autenticidad: se consulta la operación al proveedor.
    const verification = await mpGetPayment(credentials.token, paymentId);
    if (!verification.ok) {
      if (verification.status === 404) {
        await logTransaction(svc, {
          environment: mp.environment,
          kind: 'error',
          order_id: hintOrder?.id,
          order_number: hintOrder?.order_number,
          payment_id: paymentId,
          provider_status: 'payment_not_found',
          dedupe_key: `webhook:${paymentId}:not_found:${credentials.source}`,
          source: 'webhook',
          detail: `El pago no existe para el token ${credentials.source}`,
        });
        return json({ ok: true, ignored: true, reason: 'payment_not_found' });
      }
      // Error de red o del proveedor: se pide reintento a Mercado Pago.
      return json({ error: 'No se pudo verificar el pago' }, verification.status >= 500 || !verification.status ? 502 : 503);
    }

    const payment = verification.data || {};
    const orderId = String(payment.external_reference || '');
    if (!orderId) return json({ ok: true, ignored: true, reason: 'without_order' });

    if (hintOrder && hintOrder.id !== orderId) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: hintOrder.id,
        order_number: hintOrder.order_number,
        payment_id: paymentId,
        provider_status: 'order_mismatch',
        dedupe_key: `webhook:${paymentId}:order_mismatch`,
        source: 'webhook',
        detail: `La notificación apuntaba al pedido ${hintOrder.id} pero el pago es de ${orderId}`,
      });
      return json({ ok: true, ignored: true, reason: 'order_mismatch' });
    }

    const order = hintOrder || (await getOrder(svc, orderId));
    if (!order) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        payment_id: paymentId,
        provider_status: 'order_not_found',
        dedupe_key: `webhook:${paymentId}:order_not_found`,
        source: 'webhook',
        detail: `Pedido inexistente: ${orderId.slice(0, 64)}`,
      });
      return json({ ok: true, ignored: true, reason: 'order_not_found' });
    }

    await logTransaction(svc, {
      environment: mp.environment,
      kind: 'webhook_received',
      order_id: order.id,
      order_number: order.order_number,
      payment_id: paymentId,
      provider_status: String(payment.status || ''),
      provider_status_detail: String(payment.status_detail || ''),
      amount: Number(payment.transaction_amount) || 0,
      dedupe_key: `webhook:${paymentId}:${String(payment.status || '')}:${String(payment.status_detail || '')}`,
      source: 'webhook',
      detail: `Notificación verificada contra la API de pagos (${credentials.source})`,
    });

    // El pago tiene que haberlo cobrado la cuenta del comercio registrada en el pedido.
    if (order.collector_id && String(payment.collector_id || '') !== String(order.collector_id)) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: order.id,
        order_number: order.order_number,
        payment_id: paymentId,
        provider_status: 'collector_mismatch',
        dedupe_key: `order:${order.id}:payment:${paymentId}:collector_mismatch`,
        source: 'webhook',
        detail: `Cobrador ${payment.collector_id} distinto del comercio ${order.collector_id}`,
      });
      return json({ ok: true, mismatch: true });
    }

    // Control de integridad del monto y la moneda: nunca acreditar por un importe distinto.
    const paidAmount = Number(payment.transaction_amount) || 0;
    const orderTotal = Number(order.total) || 0;
    const currency = String(payment.currency_id || 'ARS');
    if (
      String(payment.status) === 'approved' &&
      (currency !== 'ARS' || (orderTotal > 0 && Math.abs(paidAmount - orderTotal) > 0.01))
    ) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: order.id,
        order_number: order.order_number,
        payment_id: paymentId,
        provider_status: 'amount_mismatch',
        amount: paidAmount,
        currency,
        dedupe_key: `order:${order.id}:payment:${paymentId}:mismatch`,
        source: 'webhook',
        detail: `Monto pagado ${paidAmount} ${currency} distinto del total ${orderTotal} ARS`,
      });
      return json({ ok: true, mismatch: true });
    }

    const result = await applyPayment(svc, {
      order,
      payment,
      environment: order.payment_environment || mp.environment,
      source: 'webhook',
      actorEmail: 'mpWebhook',
    });

    return json({
      ok: true,
      result: result.status,
      environment: mp.environment,
      signature: signature.enforced ? 'verified' : 'not_configured',
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
