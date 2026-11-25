// Tests de la verificación de firma del webhook de Mercado Pago.
// Ejecutar: deno test supabase/functions/_shared/mpConfig.test.ts
import { verifyMpWebhookSignature, webhookSecretNamesFor } from './mpConfig.ts';

const SECRET = 'test-webhook-secret-not-real';
const DATA_ID = '123456789';
const REQUEST_ID = 'req-abc-123';
const NOW = 1_764_000_000_000; // ms

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sign(secret: string, dataId: string, requestId: string, ts: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`id:${dataId};request-id:${requestId};ts:${ts};`));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const secrets = [{ name: 'MP_WEBHOOK_SECRET_TEST', value: SECRET }];

Deno.test('acepta una firma válida y dentro de la ventana', async () => {
  const ts = String(NOW);
  const v1 = await sign(SECRET, DATA_ID, REQUEST_ID, ts);
  const r = await verifyMpWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: REQUEST_ID, dataId: DATA_ID, secrets, nowMs: NOW });
  assert(r.ok && r.secretName === 'MP_WEBHOOK_SECRET_TEST', JSON.stringify(r));
});

Deno.test('rechaza si no hay secreto configurado (fail-closed)', async () => {
  const r = await verifyMpWebhookSignature({ signature: 'ts=1,v1=aa', requestId: REQUEST_ID, dataId: DATA_ID, secrets: [], nowMs: NOW });
  assert(!r.ok && r.reason === 'secret_not_configured', JSON.stringify(r));
});

Deno.test('rechaza sin header x-signature', async () => {
  const r = await verifyMpWebhookSignature({ signature: null, requestId: REQUEST_ID, dataId: DATA_ID, secrets, nowMs: NOW });
  assert(!r.ok && r.reason === 'missing_signature', JSON.stringify(r));
});

Deno.test('rechaza firma con otro secreto', async () => {
  const ts = String(NOW);
  const v1 = await sign('otro-secreto', DATA_ID, REQUEST_ID, ts);
  const r = await verifyMpWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: REQUEST_ID, dataId: DATA_ID, secrets, nowMs: NOW });
  assert(!r.ok && r.reason === 'invalid_signature', JSON.stringify(r));
});

Deno.test('rechaza si se altera el data.id firmado', async () => {
  const ts = String(NOW);
  const v1 = await sign(SECRET, DATA_ID, REQUEST_ID, ts);
  const r = await verifyMpWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: REQUEST_ID, dataId: '999', secrets, nowMs: NOW });
  assert(!r.ok && r.reason === 'invalid_signature', JSON.stringify(r));
});

Deno.test('rechaza timestamp vencido (replay)', async () => {
  const ts = String(NOW - 11 * 60 * 1000);
  const v1 = await sign(SECRET, DATA_ID, REQUEST_ID, ts);
  const r = await verifyMpWebhookSignature({ signature: `ts=${ts},v1=${v1}`, requestId: REQUEST_ID, dataId: DATA_ID, secrets, nowMs: NOW });
  assert(!r.ok && r.reason === 'timestamp_expired', JSON.stringify(r));
});

Deno.test('rechaza header mal formado', async () => {
  const r = await verifyMpWebhookSignature({ signature: 'garbage', requestId: REQUEST_ID, dataId: DATA_ID, secrets, nowMs: NOW });
  assert(!r.ok && r.reason === 'malformed_signature', JSON.stringify(r));
});

Deno.test('el secreto de pruebas no vale para producción', () => {
  assert(!webhookSecretNamesFor('production').includes('MP_WEBHOOK_SECRET_TEST'), 'TEST aceptado en producción');
  assert(!webhookSecretNamesFor('production').includes('MP_WEBHOOK_SECRET'), 'histórico aceptado en producción');
});
