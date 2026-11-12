import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { callFunction } from '../../lib/callFunction';

const ERROR_MESSAGES = {
  access_denied: 'Cancelaste la autorización en Mercado Pago.',
  invalid_state: 'El enlace de vinculación venció. Probá de nuevo.',
  exchange_failed: 'Mercado Pago no confirmó la vinculación. Probá de nuevo.',
  not_owner: 'Solo el dueño del comercio puede vincular la cuenta.',
  oauth_not_configured: 'La vinculación todavía no está habilitada. Avisale al equipo.',
};

// Consulta pura (sin estado de React). Lanza error si falla Supabase.
async function fetchConnection(businessId) {
  const { data, error } = await supabase.rpc('my_mp_connection');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.find((row) => row.business_id === businessId) || rows[0] || null;
}

// Resultado del callback OAuth (?mp=connected | ?mp=error&reason=...)
function messageFromParams(searchParams) {
  const result = searchParams.get('mp');
  if (!result) return null;
  if (result === 'connected') {
    return { type: 'success', text: '¡Listo! Tu cuenta de Mercado Pago quedó vinculada.' };
  }
  const reason = searchParams.get('reason') || '';
  return { type: 'error', text: ERROR_MESSAGES[reason] || 'No pudimos vincular la cuenta. Probá de nuevo.' };
}

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/**
 * Estado y acciones de la cuenta de Mercado Pago del comercio (modelo Marketplace).
 * Lee la RPC my_mp_connection(), que nunca devuelve tokens.
 */
export default function MercadoPagoConnect({ businessId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => messageFromParams(searchParams));

  // Recarga manual (después de desvincular)
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConnection(await fetchConnection(businessId));
    } catch (err) {
      console.error('No se pudo leer la conexión con Mercado Pago:', err.message);
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // Carga inicial: el estado solo se toca cuando llega la respuesta (y si sigue montado)
  useEffect(() => {
    let alive = true;
    fetchConnection(businessId)
      .then((result) => {
        if (alive) setConnection(result);
      })
      .catch((err) => console.error('No se pudo leer la conexión con Mercado Pago:', err.message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [businessId]);

  // Limpia ?mp= de la URL una vez leído (el mensaje ya se tomó al montar).
  useEffect(() => {
    if (!searchParams.get('mp')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('mp');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await callFunction('mpOauthStart', {
        business_id: businessId,
        return_path: '/comercio/dashboard',
      });
      if (!data?.url) throw new Error('Respuesta sin URL de autorización');
      window.location.assign(data.url);
    } catch (err) {
      setMessage({ type: 'error', text: err.detail?.message || 'No pudimos iniciar la vinculación.' });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Si desvinculás la cuenta, tus ofertas no se podrán comprar hasta que la vuelvas a conectar. ¿Continuar?')) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await callFunction('mpOauthDisconnect', { business_id: businessId });
      setMessage({ type: 'success', text: 'Cuenta desvinculada.' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.detail?.message || 'No pudimos desvincular la cuenta.' });
    } finally {
      setBusy(false);
    }
  };

  const connected = Boolean(connection?.connected);
  const status = connection?.status || 'disconnected';
  const isTest = connection?.environment === 'test';

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">💳 Cobros con Mercado Pago</h2>
          <p className="mt-1 text-sm text-gray-600">
            Las ventas se cobran directamente en tu cuenta de Mercado Pago. La plataforma retiene su comisión
            automáticamente y Mercado Pago descuenta su costo de procesamiento de tu parte.
          </p>
          {isTest && (
            <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Entorno de pruebas
            </span>
          )}
        </div>

        {!loading && (
          <div className="flex items-center gap-2">
            {connected ? (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Desvincular
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? 'Redirigiendo…' : status === 'expired' ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-sm">
        {loading ? (
          <p className="text-gray-500">Consultando el estado de tu cuenta…</p>
        ) : connected ? (
          <p className="text-green-700">
            ✅ Cuenta vinculada{connection.mp_user_id ? ` (ID ${connection.mp_user_id})` : ''}
            {connection.connected_at ? ` desde el ${formatDate(connection.connected_at)}` : ''}.
          </p>
        ) : status === 'expired' ? (
          <p className="text-red-700">
            ⚠️ La autorización venció. Reconectá tu cuenta: mientras tanto tus ofertas no se pueden comprar.
          </p>
        ) : (
          <p className="text-red-700">
            ⚠️ Todavía no vinculaste tu cuenta. Sin cuenta vinculada tus ofertas no se pueden comprar.
          </p>
        )}
      </div>

      {message && (
        <div
          className={`mt-4 rounded p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
