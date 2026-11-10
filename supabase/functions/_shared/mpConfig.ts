// deno-lint-ignore-file no-explicit-any
/**
 * Configuración de Mercado Pago por entorno.
 *
 * El entorno activo vive en la tabla platform_settings, clave `mp_environment`
 * ("test" | "production"). Cada entorno usa su propio par de credenciales,
 * guardadas como secretos de las Edge Functions (supabase secrets set):
 *
 *   test        → MP_ACCESS_TOKEN_TEST       + MP_WEBHOOK_SECRET_TEST
 *   production  → MP_ACCESS_TOKEN_PROD       + MP_WEBHOOK_SECRET_PROD
 *
 * Compatibilidad: si el secreto específico de pruebas no existe, se usa el histórico
 * MP_ACCESS_TOKEN / MP_WEBHOOK_SECRET. Nunca se exponen credenciales al frontend y
 * nunca se guardan datos de tarjeta: el cobro ocurre íntegramente en Mercado Pago.
 */

export const MP_API = 'https://api.mercadopago.com';

export const MP_ENVIRONMENTS = ['test', 'production'];

export function envSecretNames(environment: string) {
  return environment === 'production'
    ? { token: 'MP_ACCESS_TOKEN_PROD', webhook: 'MP_WEBHOOK_SECRET_PROD' }
    : { token: 'MP_ACCESS_TOKEN_TEST', webhook: 'MP_WEBHOOK_SECRET_TEST' };
}

/** Entorno activo + credenciales resueltas. `ready` indica si se puede cobrar. */
export async function resolveMpEnvironment(svc: any, readSecret: (name: string) => string) {
  let configured = 'test';
  const { data, error } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'mp_environment')
    .maybeSingle();

  if (!error) {
    const raw = String(data?.value || '').trim().toLowerCase();
    if (MP_ENVIRONMENTS.includes(raw)) configured = raw;
  }

  const names = envSecretNames(configured);
  const token =
    configured === 'production'
      ? readSecret(names.token)
      : readSecret(names.token) || readSecret('MP_ACCESS_TOKEN');
  const webhookSecret =
    configured === 'production'
      ? readSecret(names.webhook)
      : readSecret(names.webhook) || readSecret('MP_WEBHOOK_SECRET');

  return {
    environment: configured,
    token,
    webhookSecret,
    ready: Boolean(token),
    secretNames: names,
  };
}

async function mpFetch(path: string, token: string, options: any = {}) {
  try {
    const response = await fetch(`${MP_API}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout || 12000),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, error: undefined as string | undefined };
  } catch (error) {
    return { ok: false, status: 0, data: {} as any, error: (error as Error)?.message || 'network_error' };
  }
}

export function mpGetPayment(token: string, paymentId: string | number) {
  return mpFetch(`/v1/payments/${encodeURIComponent(String(paymentId))}`, token);
}

/** Búsqueda de pagos por referencia externa (usada en la conciliación). */
export function mpSearchPayments(token: string, externalReference: string) {
  const params = new URLSearchParams({
    external_reference: String(externalReference),
    sort: 'date_created',
    criteria: 'desc',
    limit: '10',
  });
  return mpFetch(`/v1/payments/search?${params.toString()}`, token);
}

/**
 * `origin` es la URL pública del frontend (p. ej. https://tu-dominio.com): se usa para
 * las back_urls. La notification_url apunta a la Edge Function mpWebhook de Supabase.
 */
export async function mpCreatePreference({ token, environment, order, origin }: any) {
  const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpWebhook`;

  const payload = {
    items: [
      {
        id: order.offer_id,
        title: String(order.offer_title || 'Paquete de rescate').slice(0, 240),
        description: 'Paquete de alimentos excedentes para retirar en el comercio',
        quantity: order.quantity,
        unit_price: Number(order.unit_price),
        currency_id: 'ARS',
      },
    ],
    payer: { email: order.user_email, name: order.user_name || '' },
    external_reference: order.id,
    notification_url: notificationUrl,
    back_urls: {
      success: `${origin}/compras/${order.id}`,
      pending: `${origin}/compras/${order.id}`,
      failure: `${origin}/compras/${order.id}`,
    },
    auto_return: 'approved',
    statement_descriptor: 'NO LO DEJES IR',
    metadata: {
      order_number: order.order_number,
      environment,
    },
  };

  const response = await mpFetch('/checkout/preferences', token, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': String(order.idempotency_key || order.id) },
    body: payload,
    timeout: 15000,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.data?.message || response.data?.error || response.error || 'mercadopago_error',
      detail: response.data,
      connectionError: response.status === 0 || response.status >= 500,
    };
  }

  const data = response.data || {};
  const initPoint = environment === 'test' ? data.sandbox_init_point || data.init_point : data.init_point;
  if (!initPoint) return { ok: false, error: 'preference_without_init_point', detail: data };
  return { ok: true, preference_id: data.id, init_point: initPoint };
}

export function mpRefundPayment(token: string, paymentId: string | number, amount?: number) {
  return mpFetch(`/v1/payments/${encodeURIComponent(String(paymentId))}/refunds`, token, {
    method: 'POST',
    body: amount ? { amount: Number(amount) } : {},
    timeout: 15000,
  });
}

const encoder = new TextEncoder();

/**
 * Firma HMAC del webhook (x-signature). Mercado Pago usa el manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con el secreto del entorno.
 */
export async function mpSignatureValid({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature?: string | null;
  requestId?: string | null;
  dataId?: string | null;
  secret?: string;
}) {
  if (!secret) return { ok: true, enforced: false };
  if (!signature) return { ok: false, enforced: true };
  const parts = Object.fromEntries(
    String(signature)
      .split(',')
      .map((part) => {
        const [k, v] = part.split('=');
        return [String(k).trim(), String(v || '').trim()];
      })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, enforced: true };

  const manifest = `id:${String(dataId || '').toLowerCase()};request-id:${requestId || ''};ts:${ts};`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { ok: hex === v1, enforced: true };
}