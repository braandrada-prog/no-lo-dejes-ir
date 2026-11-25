// Tests de la firma HMAC de las tareas programadas (pg_cron → Edge Functions).
// Ejecutar: deno test supabase/functions/_shared/auth.test.ts
import { verifyTaskSignatureWithKey } from './auth.ts';
import { hmacSha256Hex } from './crypto.ts';

const KEY = 'task-key-for-tests-not-real';
const NOW = 1_764_000_000_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function header(fn: string, t = String(NOW), key = KEY) {
  return `t=${t},v1=${await hmacSha256Hex(key, `${t}.${fn}`)}`;
}

Deno.test('vector conocido: coincide con HMAC-SHA256 estándar (openssl / pgcrypto)', async () => {
  // printf '%s' '1764000000000.releaseExpiredOrders' | openssl dgst -sha256 -hmac 'task-key-for-tests-not-real'
  const hex = await hmacSha256Hex(KEY, '1764000000000.releaseExpiredOrders');
  assert(hex === '61c3865879b684f11abe73ca65679932702625399b7f8f97ff98c2d74270624b', hex);
});

Deno.test('acepta firma válida para la función correcta', async () => {
  const r = await verifyTaskSignatureWithKey({ header: await header('mpReconcile'), functionName: 'mpReconcile', key: KEY, nowMs: NOW });
  assert(r.ok, JSON.stringify(r));
});

Deno.test('rechaza firma de otra función (no reutilizable)', async () => {
  const r = await verifyTaskSignatureWithKey({ header: await header('releaseExpiredOrders'), functionName: 'mpRefreshTokens', key: KEY, nowMs: NOW });
  assert(!r.ok && r.reason === 'invalid_signature', JSON.stringify(r));
});

Deno.test('rechaza sin header', async () => {
  const r = await verifyTaskSignatureWithKey({ header: null, functionName: 'mpReconcile', key: KEY, nowMs: NOW });
  assert(!r.ok && r.reason === 'missing_signature', JSON.stringify(r));
});

Deno.test('rechaza el token viejo en texto plano', async () => {
  const r = await verifyTaskSignatureWithKey({ header: KEY, functionName: 'mpReconcile', key: KEY, nowMs: NOW });
  assert(!r.ok && r.reason === 'malformed_signature', JSON.stringify(r));
});

Deno.test('rechaza firma vencida (replay)', async () => {
  const old = String(NOW - 6 * 60 * 1000);
  const r = await verifyTaskSignatureWithKey({ header: await header('mpReconcile', old), functionName: 'mpReconcile', key: KEY, nowMs: NOW });
  assert(!r.ok && r.reason === 'timestamp_expired', JSON.stringify(r));
});

Deno.test('rechaza si no hay clave configurada', async () => {
  const r = await verifyTaskSignatureWithKey({ header: await header('mpReconcile'), functionName: 'mpReconcile', key: '', nowMs: NOW });
  assert(!r.ok && r.reason === 'key_not_configured', JSON.stringify(r));
});

Deno.test('rechaza firma con otra clave', async () => {
  const r = await verifyTaskSignatureWithKey({
    header: await header('mpReconcile', String(NOW), 'otra-clave'),
    functionName: 'mpReconcile',
    key: KEY,
    nowMs: NOW,
  });
  assert(!r.ok && r.reason === 'invalid_signature', JSON.stringify(r));
});
