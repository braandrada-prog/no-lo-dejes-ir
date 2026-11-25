// Tests del procesamiento por lotes de reservas vencidas.
// Ejecutar: deno test supabase/functions/_shared/reservations.test.ts
import { mapSettled } from './reservations.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test('mapSettled: un fallo puntual no aborta el resto y conserva el orden', async () => {
  const results = await mapSettled([1, 2, 3, 4], 2, async (n) => {
    await sleep(5 - n);
    if (n === 2) throw new Error('falla 2');
    return n * 10;
  });
  assert(results.length === 4, 'faltan resultados');
  assert(results[0].status === 'fulfilled' && results[0].value === 10, JSON.stringify(results[0]));
  assert(results[1].status === 'rejected', 'el 2 debía fallar');
  assert(results[3].status === 'fulfilled' && results[3].value === 40, JSON.stringify(results[3]));
});

Deno.test('mapSettled: nunca supera el límite de concurrencia', async () => {
  let inFlight = 0;
  let peak = 0;
  await mapSettled(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await sleep(2);
    inFlight--;
  });
  assert(peak <= 3, `pico de concurrencia ${peak}`);
  assert(peak > 1, 'debía correr en paralelo');
});

Deno.test('mapSettled: lista vacía', async () => {
  const results = await mapSettled([], 5, async () => 1);
  assert(results.length === 0, 'debía devolver []');
});
