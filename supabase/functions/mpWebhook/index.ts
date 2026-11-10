// deno-lint-ignore-file no-explicit-any
import { json } from '../_shared/cors.ts';
import { adminClient, readSecret } from '../_shared/auth.ts';
import { mpGetPayment, mpSignatureValid, resolveMpEnvironment } from '../_shared/mpConfig.ts';
import { applyPayment, logTransaction } from '../_shared/payments.ts';

/**
 * Notificación de Mercado Pago.
 *
 * Se despliega con verify_jwt = false (Mercado Pago no envía JWT de Supabase).
 * La seguridad la dan estos controles:
 *
 * 1. Se valida la firma HMAC del webhook con el secreto del entorno activo.
 * 2. Nunca se confía en el cuerpo: se consulta el pago real a la API de Mercado Pago.
 * 3. Se verifica que el monto coincida con el pedido antes de confirmar.
 * 4. La aplicación del estado es idempotente (compare-and-set + payment_transactions),
 *    así un webhook repetido no duplica la confirmación ni el stock.
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
      body?.data?.id || body?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || ''
    ).trim();

    if (topic !== 'payment' || !paymentId) {
      return json({ ok: true, ignored: true });
    }

    const mp = await resolveMpEnvironment(svc, readSecret);
    if (!mp.ready) {
      return json({ error: 'Pagos no configurados' }, 503);
    }

    const signature = await mpSignatureValid({
      signature: req.headers.get('x-signature') || '',
      requestId: req.headers.get('x-request-id') || '',
      dataId: paymentId,
      secret: mp.webhookSecret,
    });

    if (!signature.ok) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        payment_id: paymentId,
        provider_status: 'invalid_signature',
        dedupe_key: `webhook:${paymentId}:invalid_signature:${Date.now()}`,
        source: 'webhook',
        detail: 'Firma del webhook inválida: notificación descartada',
      });
      return json({ error: 'Firma inválida' }, 401);
    }

    // Verificación de autenticidad: se consulta la operación al proveedor.
    const verification = await mpGetPayment(mp.token, paymentId);
    if (!verification.ok) {
      if (verification.status === 404) {
        return json({ ok: true, ignored: true, reason: 'payment_not_found' });
      }
      // Error de red o del proveedor: se pide reintento a Mercado Pago.
      return json({ error: 'No se pudo verificar el pago' }, verification.status || 502);
    }

    const payment = verification.data || {};
    const orderId = String(payment.external_reference || '');
    if (!orderId) return json({ ok: true, ignored: true, reason: 'without_order' });

    const { data: order, error: orderError } = await svc
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: 'Pedido inexistente' }, 404);

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
      detail: 'Notificación verificada contra la API de pagos',
    });

    // Control de integridad del monto: nunca acreditar un pedido por un importe distinto.
    const paidAmount = Number(payment.transaction_amount) || 0;
    const orderTotal = Number(order.total) || 0;
    if (String(payment.status) === 'approved' && orderTotal > 0 && Math.abs(paidAmount - orderTotal) > 1) {
      await logTransaction(svc, {
        environment: mp.environment,
        kind: 'error',
        order_id: order.id,
        order_number: order.order_number,
        payment_id: paymentId,
        provider_status: 'amount_mismatch',
        amount: paidAmount,
        dedupe_key: `order:${order.id}:payment:${paymentId}:mismatch`,
        source: 'webhook',
        detail: `Monto pagado ${paidAmount} distinto del total ${orderTotal}`,
      });
      return json({ ok: true, mismatch: true });
    }

    const result = await applyPayment(svc, {
      order,
      payment,
      environment: mp.environment,
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