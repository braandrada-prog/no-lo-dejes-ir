import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { callFunction } from '../../lib/callFunction';

const STATUS_LABELS = {
  connected: ['Vinculada', 'bg-green-100 text-green-800'],
  expired: ['Vencida', 'bg-amber-100 text-amber-800'],
  revoked: ['Desvinculada', 'bg-gray-100 text-gray-700'],
  disconnected: ['Sin vincular', 'bg-red-100 text-red-800'],
};

// Consulta pura (sin estado de React). Lanza error si falla Supabase.
async function fetchSettings() {
  const [biz, conn, env] = await Promise.all([
    supabase.from('businesses').select('id, name, city, status').order('name'),
    supabase.rpc('admin_mp_connections'),
    supabase.rpc('mp_active_environment'),
  ]);
  if (biz.error) throw biz.error;
  if (conn.error) throw conn.error;
  return {
    businesses: biz.data ?? [],
    connections: conn.data ?? [],
    environment: !env.error && typeof env.data === 'string' ? env.data : null,
  };
}

const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('es-AR') : '—');

/**
 * Configuración de la plataforma: estado de vinculación de Mercado Pago (Marketplace)
 * de cada comercio. Usa la RPC admin_mp_connections(), que nunca devuelve tokens.
 */
export default function AdminSettings() {
  const [businesses, setBusinesses] = useState([]);
  const [connections, setConnections] = useState([]);
  const [environment, setEnvironment] = useState('test');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  // Recarga manual: conserva el entorno elegido en el selector.
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchSettings();
      setBusinesses(result.businesses);
      setConnections(result.connections);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial: arranca mostrando el entorno de cobro activo.
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then((result) => {
        if (!alive) return;
        setBusinesses(result.businesses);
        setConnections(result.connections);
        if (result.environment) setEnvironment(result.environment);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      businesses.map((business) => {
        const connection = connections.find((c) => c.business_id === business.id && c.environment === environment);
        return { business, connection, status: connection?.status || 'disconnected' };
      }),
    [businesses, connections, environment]
  );

  const connectedCount = rows.filter((row) => row.status === 'connected').length;

  const disconnect = async (businessId) => {
    if (!window.confirm('El comercio no podrá vender hasta reconectar su cuenta. ¿Desvincular?')) return;
    setBusyId(businessId);
    try {
      await callFunction('mpOauthDisconnect', { business_id: businessId, environment });
      await load();
    } catch (err) {
      alert(err.detail?.message || err.message || 'No se pudo desvincular.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Cobros con Mercado Pago (Marketplace)</h2>
            <p className="text-sm text-gray-600">
              Cada comercio cobra en su propia cuenta; la plataforma retiene su comisión con marketplace_fee. Sin
              cuenta vinculada el comercio no puede vender.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="mp-env" className="text-gray-600">
              Entorno
            </label>
            <select
              id="mp-env"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="test">Pruebas</option>
              <option value="production">Producción</option>
            </select>
            <button
              type="button"
              onClick={load}
              className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50"
            >
              Actualizar
            </button>
          </div>
        </div>
        {!loading && !error && (
          <p className="mt-3 text-sm text-gray-700">
            {connectedCount} de {rows.length} comercios con cuenta vinculada.
          </p>
        )}
      </div>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Comercio</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Usuario MP</th>
              <th className="px-4 py-2">Vinculada</th>
              <th className="px-4 py-2">Vence</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No hay comercios cargados.
                </td>
              </tr>
            ) : (
              rows.map(({ business, connection, status }) => {
                const [label, style] = STATUS_LABELS[status] || STATUS_LABELS.disconnected;
                return (
                  <tr key={business.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{business.name || 'Sin nombre'}</div>
                      <div className="text-xs text-gray-500">{business.city || ''}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{connection?.mp_user_id || '—'}</td>
                    <td className="px-4 py-2">{formatDate(connection?.connected_at)}</td>
                    <td className="px-4 py-2">{formatDate(connection?.expires_at)}</td>
                    <td className="px-4 py-2 text-right">
                      {status === 'connected' && (
                        <button
                          type="button"
                          onClick={() => disconnect(business.id)}
                          disabled={busyId === business.id}
                          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Desvincular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
