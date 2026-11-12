import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { callFunction } from '../../lib/callFunction';
import { ars } from '../../lib/format';
import { TZ } from '../../lib/argTime';

const REFRESH_MS = 20000;
const CODE_LENGTH = 6;

const REJECTION_TITLES = {
  invalid_qr: 'Código no encontrado',
  invalid_format: 'Código incompleto',
  already_redeemed: 'Este pedido ya fue entregado',
  not_paid: 'El pedido no está pagado',
  refunded: 'Pedido reembolsado',
  outside_pickup_window: 'Fuera del horario de retiro',
  no_business: 'Sin comercio asociado',
};

const time = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
};

const windowLabel = (start, end) => `${time(start)} a ${time(end)}`;

const isPastWindow = (order) => {
  const end = Date.parse(order?.pickup_end || '');
  return Number.isFinite(end) && end < Date.now();
};

// Consulta pura (sin estado de React). Lanza error si falla Supabase.
async function fetchPickups() {
  const { data, error } = await supabase.rpc('merchant_pickup_orders');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return {
    pending: rows.filter((row) => row.status === 'paid'),
    delivered: rows.filter((row) => row.status === 'picked_up'),
  };
}

function OrderSummary({ summary }) {
  if (!summary) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="text-gray-500">Pedido</dt>
      <dd className="font-mono">{summary.order_number}</dd>
      <dt className="text-gray-500">Comprador</dt>
      <dd>{summary.buyer_name || 'Sin nombre'}</dd>
      <dt className="text-gray-500">Producto</dt>
      <dd>
        {summary.offer_title} × {summary.quantity}
      </dd>
      <dt className="text-gray-500">Total</dt>
      <dd>{ars(summary.total)}</dd>
      {summary.pickup_start && (
        <>
          <dt className="text-gray-500">Horario</dt>
          <dd>{windowLabel(summary.pickup_start, summary.pickup_end)}</dd>
        </>
      )}
      {summary.redeemed_at && (
        <>
          <dt className="text-gray-500">Entregado</dt>
          <dd>{time(summary.redeemed_at)}</dd>
        </>
      )}
    </dl>
  );
}

/**
 * Validación de retiros (ingreso manual del código de 6 caracteres) y lista de pedidos
 * pagados por retirar + retirados hoy. La lista se refresca sola cada 20 s mientras la
 * pestaña está visible, y al instante después de cada validación.
 */
export default function MerchantPickups() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [lists, setLists] = useState({ pending: [], delivered: [] });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const applyLists = useCallback((data) => {
    setLists(data);
    setListError('');
    setUpdatedAt(new Date());
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyLists(await fetchPickups());
    } catch (err) {
      console.error('No se pudieron cargar los pedidos del comercio:', err.message);
      setListError('No pudimos actualizar la lista de pedidos. Reintentamos en unos segundos.');
    } finally {
      setLoading(false);
    }
  }, [applyLists]);

  // Carga inicial + refresco periódico (solo con la pestaña visible).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchPickups()
        .then((data) => {
          if (alive) applyLists(data);
        })
        .catch((err) => {
          console.error('No se pudieron cargar los pedidos del comercio:', err.message);
          if (alive) setListError('No pudimos actualizar la lista de pedidos. Reintentamos en unos segundos.');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyLists]);

  const onCodeChange = (e) => {
    // Solo letras y números, en mayúsculas, máximo 6.
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
    if (result) setResult(null);
  };

  const redeem = async (e) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const data = await callFunction('merchantRedeem', { code });
      setResult({ ok: true, summary: data?.summary || null });
      setCode('');
      refresh();
    } catch (err) {
      const detail = err.detail || {};
      setResult({
        ok: false,
        title: REJECTION_TITLES[detail.code] || 'No se pudo validar el retiro',
        message:
          detail.error ||
          (err.message?.includes('Failed to fetch')
            ? 'Sin conexión. Revisá internet y probá de nuevo.'
            : 'No pudimos validar el retiro. Probá de nuevo en unos segundos.'),
        summary: detail.summary || null,
      });
      if (detail.code === 'already_redeemed') refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-6">
      {/* Validar retiro */}
      <section>
        <h2 className="text-lg font-bold text-gray-900">✅ Validar retiro</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pedile al cliente el código de {CODE_LENGTH} caracteres que aparece debajo de su QR en la app.
        </p>

        <form onSubmit={redeem} className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="pickup-code" className="sr-only">
            Código de retiro
          </label>
          <input
            id="pickup-code"
            type="text"
            value={code}
            onChange={onCodeChange}
            placeholder="ABC123"
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="done"
            aria-describedby="pickup-code-help"
            className="w-48 rounded-md border border-gray-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] uppercase focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200"
          />
          <button
            type="submit"
            disabled={code.length !== CODE_LENGTH || submitting}
            className="rounded-md bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Validando…' : 'Validar entrega'}
          </button>
          <span id="pickup-code-help" className="text-xs text-gray-500">
            {code.length}/{CODE_LENGTH}
          </span>
        </form>

        {result && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-md border p-4 ${
              result.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <p className="font-semibold">
              {result.ok ? '✔ Entregado: podés darle el pedido al cliente.' : `✖ ${result.title}`}
            </p>
            {!result.ok && <p className="mt-1 text-sm">{result.message}</p>}
            <OrderSummary summary={result.summary} />
          </div>
        )}
      </section>

      {/* Lista de pedidos */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-900">📦 Pedidos de hoy</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {updatedAt && <span>Actualizado {time(updatedAt.toISOString())}</span>}
            <button
              type="button"
              onClick={refresh}
              className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Actualizar
            </button>
          </div>
        </div>

        {listError && <div className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800">{listError}</div>}

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Cargando pedidos…</p>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Por retirar ({lists.pending.length})</h3>
              {lists.pending.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No hay pedidos pagados pendientes de retiro.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
                  {lists.pending.map((order) => (
                    <li key={order.order_id} className="flex items-start justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">
                          {order.offer_title} × {order.quantity}
                        </p>
                        <p className="text-gray-600">{order.buyer_name || 'Sin nombre'}</p>
                        <p className="font-mono text-xs text-gray-400">{order.order_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-700">{windowLabel(order.pickup_start, order.pickup_end)}</p>
                        {isPastWindow(order) && (
                          <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            Horario vencido
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700">Retirados hoy ({lists.delivered.length})</h3>
              {lists.delivered.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">Todavía no se entregó ningún pedido hoy.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-200">
                  {lists.delivered.map((order) => (
                    <li key={order.order_id} className="flex items-start justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">
                          {order.offer_title} × {order.quantity}
                        </p>
                        <p className="text-gray-600">{order.buyer_name || 'Sin nombre'}</p>
                        <p className="font-mono text-xs text-gray-400">{order.order_number}</p>
                      </div>
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        Entregado {time(order.redeemed_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
