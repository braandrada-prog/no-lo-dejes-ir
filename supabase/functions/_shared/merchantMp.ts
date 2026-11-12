// deno-lint-ignore-file no-explicit-any
/**
 * Credenciales OAuth de Mercado Pago por comercio (modelo Marketplace).
 *
 * - Los tokens viven cifrados en merchant_mp_accounts (solo service role).
 * - getMerchantCredentials() descifra y renueva automáticamente si el token vence pronto.
 * - resolveOrderToken() elige el token correcto para operar un pedido existente:
 *     pedido con collector_id → token del comercio
 *     pedido histórico (previo al split) → token de la plataforma
 */
import { decryptToken, encryptToken } from './crypto.ts';
import { mpRefreshToken, resolveMpEnvironment } from './mpConfig.ts';
import { readSecret } from './auth.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFRESH_WINDOW_DAYS = 7;

const ACCOUNT_COLUMNS =
  'id, business_id, environment, mp_user_id, access_token_enc, refresh_token_enc, public_key, scope, live_mode, expires_at, status, updated_at';

export async function getMerchantAccount(svc: any, businessId: string, environment: string) {
  if (!businessId) return null;
  const { data, error } = await svc
    .from('merchant_mp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('business_id', businessId)
    .eq('environment', environment)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function findAccountByMpUserId(svc: any, mpUserId: string, environment: string) {
  if (!mpUserId) return null;
  const { data, error } = await svc
    .from('merchant_mp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('mp_user_id', String(mpUserId))
    .eq('environment', environment)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function tokenFields(tokenData: any) {
  const expiresIn = Number(tokenData?.expires_in) || 0;
  return {
    mp_user_id: String(tokenData?.user_id || ''),
    access_token_enc: await encryptToken(tokenData?.access_token),
    refresh_token_enc: await encryptToken(tokenData?.refresh_token),
    public_key: tokenData?.public_key || null,
    scope: tokenData?.scope || null,
    live_mode: Boolean(tokenData?.live_mode),
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

/** Alta o reconexión de un comercio tras el intercambio OAuth. */
export async function saveMerchantTokens(
  svc: any,
  { businessId, environment, tokenData, connectedBy }: any
) {
  if (!tokenData?.access_token || !tokenData?.user_id) throw new Error('Respuesta OAuth incompleta');
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('merchant_mp_accounts')
    .upsert(
      {
        business_id: businessId,
        environment,
        ...(await tokenFields(tokenData)),
        status: 'connected',
        connected_by: connectedBy || null,
        connected_at: now,
        last_refreshed_at: now,
        last_error: null,
      },
      { onConflict: 'business_id,environment' }
    )
    .select('id, business_id, environment, mp_user_id, live_mode, expires_at, status')
    .single();
  if (error) throw error;
  return data;
}

function isExpired(account: any) {
  return Boolean(account?.expires_at) && new Date(account.expires_at).getTime() <= Date.now();
}

function needsRefresh(account: any, windowDays = REFRESH_WINDOW_DAYS) {
  if (!account?.expires_at) return false;
  return new Date(account.expires_at).getTime() - Date.now() < windowDays * DAY_MS;
}

/**
 * Renueva el access_token con el refresh_token. Si dos procesos renuevan a la vez y el
 * nuestro falla, se relee la fila: si otro ya la actualizó, se usa ese resultado.
 */
export async function refreshMerchantAccount(svc: any, account: any, mp?: any) {
  const config = mp && mp.environment === account.environment
    ? mp
    : await resolveMpEnvironment(svc, readSecret, account.environment);

  const fail = async (message: string, fatal: boolean) => {
    const fresh = await getMerchantAccount(svc, account.business_id, account.environment);
    if (fresh && fresh.updated_at !== account.updated_at && fresh.status === 'connected' && !isExpired(fresh)) {
      return { ok: true, account: fresh, refreshed: false };
    }
    const fields: Record<string, unknown> = { last_error: message.slice(0, 500) };
    if (fatal || isExpired(account)) fields.status = 'expired';
    await svc.from('merchant_mp_accounts').update(fields).eq('id', account.id);
    return { ok: false, account: { ...account, ...fields }, error: message };
  };

  if (!config.clientId || !config.clientSecret) return fail('OAuth no configurado para el entorno', false);

  let refreshToken: string | null = null;
  try {
    refreshToken = await decryptToken(account.refresh_token_enc);
  } catch (error) {
    return fail(`No se pudo descifrar el refresh_token: ${(error as Error).message}`, true);
  }
  if (!refreshToken) return fail('El comercio no tiene refresh_token', true);

  const response = await mpRefreshToken({ mp: config, refreshToken });
  if (!response.ok) {
    const code = String(response.data?.error || response.data?.message || response.error || 'refresh_failed');
    // 400/401 = refresh_token inválido o revocado → el comercio debe reconectar.
    const fatal = response.status === 400 || response.status === 401;
    return fail(`Renovación rechazada (${response.status}): ${code}`, fatal);
  }

  const fields = {
    ...(await tokenFields(response.data)),
    status: 'connected',
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
  };
  // Si Mercado Pago no devolvió user_id, se conserva el actual.
  if (!fields.mp_user_id) fields.mp_user_id = account.mp_user_id;
  if (!fields.refresh_token_enc) fields.refresh_token_enc = account.refresh_token_enc;

  const { data, error } = await svc
    .from('merchant_mp_accounts')
    .update(fields)
    .eq('id', account.id)
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw error;
  return { ok: true, account: data, refreshed: true };
}

/**
 * Token utilizable del comercio. Devuelve { ok, token, mpUserId, account } o { ok:false, reason }.
 * reason: not_connected | expired | revoked | decrypt_failed
 */
export async function getMerchantCredentials(
  svc: any,
  businessId: string,
  environment: string,
  { mp }: { mp?: any } = {}
): Promise<any> {
  let account = await getMerchantAccount(svc, businessId, environment);
  if (!account || !account.access_token_enc) return { ok: false, reason: 'not_connected' };
  if (account.status !== 'connected') return { ok: false, reason: account.status, account };

  if (needsRefresh(account)) {
    const refreshed = await refreshMerchantAccount(svc, account, mp);
    if (refreshed.ok) account = refreshed.account;
    else if (isExpired(account)) return { ok: false, reason: 'expired', account: refreshed.account };
    // Si la renovación falló pero el token sigue vigente, se usa igual (se reintenta luego).
  }

  try {
    const token = await decryptToken(account.access_token_enc);
    if (!token) return { ok: false, reason: 'not_connected', account };
    return { ok: true, token, mpUserId: String(account.mp_user_id), account };
  } catch (error) {
    console.error('No se pudo descifrar el token del comercio:', businessId, (error as Error).message);
    return { ok: false, reason: 'decrypt_failed', account };
  }
}

/**
 * Token para operar un pedido existente (consultar, conciliar, reembolsar).
 * Usa el entorno con el que se cobró el pedido, no el activo.
 */
export async function resolveOrderToken(svc: any, order: any, mp?: any): Promise<any> {
  const environment = order?.payment_environment || mp?.environment || 'test';
  const businessId = order?.merchant_id || order?.business_id;

  if (order?.collector_id) {
    const creds = await getMerchantCredentials(svc, businessId, environment, { mp });
    if (creds.ok && String(creds.mpUserId) !== String(order.collector_id)) {
      // El comercio reconectó otra cuenta de Mercado Pago: se busca la original.
      const original = await findAccountByMpUserId(svc, order.collector_id, environment);
      if (original) {
        const creds2 = await getMerchantCredentials(svc, original.business_id, environment, { mp });
        if (creds2.ok) return { ...creds2, source: 'merchant', environment };
      }
    }
    return { ...creds, source: 'merchant', environment };
  }

  // Pedido histórico, cobrado con la cuenta de la plataforma.
  const platform =
    mp && mp.environment === environment ? mp : await resolveMpEnvironment(svc, readSecret, environment);
  return platform.token
    ? { ok: true, token: platform.token, source: 'platform', environment }
    : { ok: false, reason: 'platform_token_missing', source: 'platform', environment };
}

/** Renueva las cuentas que vencen dentro de `windowDays` (tarea programada diaria). */
export async function refreshDueAccounts(svc: any, windowDays = REFRESH_WINDOW_DAYS) {
  const limit = new Date(Date.now() + windowDays * DAY_MS).toISOString();
  const { data, error } = await svc
    .from('merchant_mp_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('status', 'connected')
    .lt('expires_at', limit)
    .limit(50);
  if (error) throw error;

  const summary = { checked: 0, refreshed: 0, failed: 0 };
  for (const account of data ?? []) {
    summary.checked += 1;
    const result = await refreshMerchantAccount(svc, account);
    if (result.ok) summary.refreshed += 1;
    else summary.failed += 1;
  }
  return summary;
}
