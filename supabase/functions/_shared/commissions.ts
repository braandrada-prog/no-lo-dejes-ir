// deno-lint-ignore-file no-explicit-any
/** Comisiones configurables por comercio y valores por defecto de la plataforma. */

export const DEFAULT_COMMISSION_PERCENT = 15;

export function roundMoney(value: number | string) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export async function readSettings(svc: any, keys: string[]) {
  const { data, error } = await svc.from('platform_settings').select('key, value').in('key', keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row: any) => [row.key, row.value]));
}

/**
 * Comisión aplicable: override del comercio, o el valor global de platform_settings
 * (claves `commission_percent` y `commission_fixed`).
 * Devuelve { rate, fixed, source }.
 */
export async function resolveCommission(svc: any, merchantId?: string | null) {
  const settings: Record<string, any> = await readSettings(svc, ['commission_percent', 'commission_fixed']);
  const globalRate = Number(settings.commission_percent);
  const fixed = Number(settings.commission_fixed) || 0;

  let merchantRate: number | null = null;
  if (merchantId) {
    // offers.merchant_id apunta a businesses.id. Si el comercio no tiene override
    // (commission_rate null) o no se encuentra, se usa la comisión global.
    const { data: merchant, error } = await svc
      .from('businesses')
      .select('commission_rate')
      .eq('id', merchantId)
      .maybeSingle();
    if (!error && merchant && merchant.commission_rate !== undefined && merchant.commission_rate !== null) {
      merchantRate = Number(merchant.commission_rate);
    }
  }

  const rate = Number.isFinite(merchantRate)
    ? (merchantRate as number)
    : Number.isFinite(globalRate)
      ? globalRate
      : DEFAULT_COMMISSION_PERCENT;

  return {
    rate: Math.min(Math.max(rate, 0), 60),
    fixed: Math.max(fixed, 0),
    source: Number.isFinite(merchantRate) ? 'merchant' : 'platform',
  };
}

export function computeFees(total: number, { rate, fixed = 0 }: { rate: number; fixed?: number }) {
  const gross = roundMoney(total);
  const commission = roundMoney((gross * rate) / 100 + fixed);
  const net = roundMoney(gross - commission);
  return { commission: Math.max(commission, 0), net, rate };
}