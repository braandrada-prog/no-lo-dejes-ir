// deno-lint-ignore-file no-explicit-any
/**
 * Configuración de Mercado Pago por entorno (modelo Marketplace).
 *
 * El entorno activo vive en la tabla platform_settings, clave `mp_environment`
 * ("test" | "production"). Secretos de las Edge Functions (supabase secrets set):
 *
 *   Aplicación Marketplace (OAuth de comercios):
 *     test        → MP_CLIENT_ID_TEST  + MP_CLIENT_SECRET_TEST
 *     production  → MP_CLIENT_ID_PROD  + MP_CLIENT_SECRET_PROD
 *     MP_OAUTH_REDIRECT_URI  → URL pública de la función mpOauthCallback
 *     MP_TOKEN_ENC_KEY       → clave AES-256 (base64) para cifrar los tokens
 *
 *   Webhook (firma x-signature de la aplicación):
 *     test        → MP_WEBHOOK_SECRET_TEST
 *     production  → MP_WEBHOOK_SECRET_PROD
 *
 *   Token de la plataforma (solo pedidos históricos, previos al split):
 *     test        → MP_ACCESS_TOKEN_TEST
 *     production  → MP_ACCESS_TOKEN_PROD
 *
 * Compatibilidad: en pruebas, si no existe el secreto específico se usan los históricos
 * MP_ACCESS_TOKEN / MP_WEBHOOK_SECRET / MP_CLIENT_ID / MP_CLIENT_SECRET.
 * Nunca se exponen credenciales al frontend y nunca se guardan datos de tarjeta.
 */
import { timingSafeEqual } from './crypto.ts';

export const MP_API = 'https://api.mercadopago.com';
export const MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';

export const MP_ENVIRONMENTS = ['test', 'production'];

export function envSecretNames(environment: string) {
  return environment === 'production'
    ? {
        token: 'MP_ACCESS_TOKEN_PROD',
        webhook: 'MP_WEBHOOK_SECRET_PROD',
        clientId: 'MP_CLIENT_ID_PROD',
        clientSecret: 'MP_CLIENT_SECRET_PROD',
      }
    : {
        token: 'MP_ACCESS_TOKEN_TEST',
        webhook: 'MP_WEBHOOK_SECRET_TEST',
        clientId: 'MP_CLIENT_ID_TEST',
        clientSecret: 'MP_CLIENT_SECRET_TEST',
      };
}

function pick(environment: string, readSecret: (name: string) => string, specific: string, legacy: string) {
  return environment === 'production' ? readSecret(specific) : readSecret(specific) || readSecret(legacy);
}

/** Lee el entorno activo de platform_settings ("test" por defecto). */
export async function activeEnvironment(svc: any) {
  const { data, error } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'mp_environment')
    .maybeSingle();
  if (!error) {
    const raw = String(data?.value || '').trim().toLowerCase();
    if (MP_ENVIRONMENTS.includes(raw)) return raw;
  }
  return 'test';
}

/**
 * Entorno activo + credenciales de la plataforma.
 * `token` es el token PROPIO de la plataforma: solo se usa para pedidos históricos
 * (sin collector_id). Los cobros nuevos usan el token OAuth del comercio.
 * `oauthReady` indica si se pueden vincular comercios; `ready` se mantiene por compatibilidad.
 */
export async function resolveMpEnvironment(svc: any, readSecret: (name: string) => string, forced?: string) {
  const configured = forced && MP_ENVIRONMENTS.includes(forced) ? forced : await activeEnvironment(svc);
  const names = envSecretNames(configured);

  const token = pick(configured, readSecret, names.token, 'MP_ACCESS_TOKEN');
  const webhookSecret = pick(configured, readSecret, names.webhook, 'MP_WEBHOOK_SECRET');
  const clientId = pick(configured, readSecret, names.clientId, 'MP_CLIENT_ID');
  const clientSecret = pick(configured, readSecret, names.clientSecret, 'MP_CLIENT_SECRET');
  const redirectUri = readSecret('MP_OAUTH_REDIRECT_URI');
  const encryptionKey = readSecret('MP_TOKEN_ENC_KEY');

  return {
    environment: configured,
    token,
    webhookSecret,
    clientId,
    clientSecret,
    redirectUri,
    ready: Boolean(token),
    oauthReady: Boolean(clientId && clientSecret && redirectUri && encryptionKey),
    secretNames: names,
  };
}

async function mpFetch(path: string, token: string | null, options: any = {}) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${MP_API}${path}`, {
      method: options.method || 'GET',
      headers,
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

// ── OAuth (vinculación de comercios) ────────────────────────────────────────────

/** URL de autorización a la que se redirige al dueño del comercio. */
export function mpAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }: any) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri,
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `${MP_AUTH_URL}?${params.toString()}`;
}

/**
 * POST /oauth/token. Sirve para el intercambio inicial (authorization_code) y para la
 * renovación (refresh_token). En pruebas se pide `test_token` para obtener credenciales TEST-.
 */
export function mpOauthToken(body: Record<string, unknown>) {
  return mpFetch('/oauth/token', null, { method: 'POST', body, timeout: 15000 });
}

export function mpExchangeCode({ mp, code, codeVerifier }: any) {
  const body: Record<string, unknown> = {
    client_id: mp.clientId,
    client_secret: mp.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: mp.redirectUri,
  };
  if (codeVerifier) body.code_verifier = codeVerifier;
  if (mp.environment === 'test') body.test_token = true;
  return mpOauthToken(body);
}

export function mpRefreshToken({ mp, refreshToken }: any) {
  return mpOauthToken({
    client_id: mp.clientId,
    client_secret: mp.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

// ── Checkout Pro ────────────────────────────────────────────────────────────────

/**
 * Crea la preferencia CON EL TOKEN DEL COMERCIO (split de pagos).
 * `marketplaceFee` es el monto absoluto (ARS) que retiene la plataforma; Mercado Pago
 * descuenta su comisión de pasarela de la parte del comercio.
 * `origin` es la URL pública del frontend (back_urls). La notification_url apunta a
 * mpWebhook e incluye el id del pedido para resolver el token del comercio.
 */
export async function mpCreatePreference({ token, environment, order, origin, marketplaceFee, expiresAt }: any) {
  const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpWebhook?order=${encodeURIComponent(
    order.id
  )}`;

  const payload: Record<string, unknown> = {
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

  const fee = Number(marketplaceFee) || 0;
  if (fee > 0) payload.marketplace_fee = fee;

  // La preferencia vence junto con la reserva de stock: evita cobros fuera de término.
  if (expiresAt) {
    payload.expires = true;
    payload.expiration_date_to = new Date(expiresAt).toISOString();
  }

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
    headers: { 'X-Idempotency-Key': `refund-${paymentId}-${amount || 'full'}` },
    body: amount ? { amount: Number(amount) } : {},
    timeout: 15000,
  });
}

// ── Firma del webhook ───────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * Firma HMAC del webhook (x-signature). Mercado Pago usa el manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con el secreto de la aplicación.
 *
 * Sin secreto configurado: en producción se RECHAZA; en pruebas se acepta y se informa
 * `enforced: false` (igual se consulta el pago real a la API antes de aplicar nada).
 */
export async function mpSignatureValid({
  signature,
  requestId,
  dataId,
  secret,
  environment,
}: {
  signature?: string | null;
  requestId?: string | null;
  dataId?: string | null;
  secret?: string;
  environment?: string;
}) {
  if (!secret) return { ok: environment !== 'production', enforced: false };
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
  return { ok: timingSafeEqual(hex, v1.toLowerCase()), enforced: true };
}
