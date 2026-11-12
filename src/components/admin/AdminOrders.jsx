import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, ScanLine } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import { callFunction } from '../../lib/callFunction';
import { ars, dateLabel, orderStatus, statusClasses } from '../../lib/format';
import { logAction } from '../../lib/audit';

export default function AdminOrders({ user }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) {
      console.error('Error cargando pedidos:', error);
      setMessage('No pudimos cargar los pedidos.');
      return;
    }
    setOrders(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const redeem = async () => {
    setMessage('');
    setBusy(true);
    try {
      const data = await callFunction('redeemOrder', { code: code.trim() });
      setMessage(`Retiro validado: ${data?.order?.order_number || 'pedido entregado'}.`);
      setCode('');
      await load();
    } catch (err) {
      setMessage(err.detail?.error || 'No pudimos validar el código.');
    } finally {
      setBusy(false);
    }
  };

  const refund = async (order) => {
    if (!window.confirm(`¿Reembolsar ${ars(order.total)} del pedido ${order.order_number}? Se anula el QR.`)) return;
    setMessage('');
    let done = false;

    try {
      await callFunction('refundOrder', {
        order_id: order.id,
        reason: 'Reembolso gestionado por el administrador',
      });
      setMessage(`Reembolso procesado para ${order.order_number}.`);
      done = true;
    } catch (err) {
      const fallback = window.confirm(
        `${err.detail?.message || 'Mercado Pago no confirmó el reembolso.'}\n\n¿Registrarlo como reembolso manual (ya hecho en Mercado Pago)?`
      );
      if (fallback) {
        try {
          await callFunction('refundOrder', {
            order_id: order.id,
            manual: true,
            reason: 'Reembolso manual registrado desde el panel',
          });
          setMessage(`Reembolso manual registrado para ${order.order_number}.`);
          done = true;
        } catch (manualErr) {
          setMessage(manualErr.detail?.error || 'No pudimos registrar el reembolso manual.');
        }
      }
    }

    if (done) {
      await logAction(user, 'order.refund', order.order_number, `Reembolso de ${ars(order.total)}`);
    }
    await load();
  };

  const cancel = async (order) => {
    if (!window.confirm(`¿Cancelar el pedido ${order.order_number}? Se liberan las unidades.`)) return;
    setMessage('');

    try {
      const data = await callFunction('cancelOrder', {
        order_id: order.id,
        reason: 'Cancelado por el administrador',
      });
      setMessage(`Pedido ${order.order_number}: ${data?.status || 'cancelado'}.`);
      await logAction(user, 'order.cancel', order.order_number, 'Pedido cancelado por el administrador');
    } catch (err) {
      setMessage(err.detail?.error || 'No pudimos cancelar el pedido.');
    }
    await load();
  };

  const reconcile = async (order) => {
    setBusy(true);
    setMessage('');
    try {
      const data = await callFunction('mpReconcile', { order_id: order.id });
      setMessage(
        `Pedido ${order.order_number}: ${data?.status || 'sin cambios'} (${data?.payment_status || 'sin estado'}).`
      );
    } catch (err) {
      setMessage(err.detail?.message || err.detail?.error || 'No pudimos conciliar el pago.');
    } finally {
      setBusy(false);
    }
    await load();
  };

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <ScanLine className="h-4 w-4 text-primary" /> Validar retiro
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Escaneá el QR del consumidor o ingresá su código de 6 caracteres. Cada código se invalida al
          usarse.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Código o token del QR"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={redeem}
            disabled={busy || !code.trim()}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Validando…' : 'Validar'}
          </button>
        </div>
        {message && <p className="mt-2 text-[11px] text-primary">{message}</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['all', 'pending_payment', 'paid', 'picked_up', 'cancelled', 'refunded', 'expired'].map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${
              filter === key ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'
            }`}
          >
            {key === 'all' ? 'Todos' : orderStatus[key]?.label || key}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Pedido</th>
              <th className="px-3 py-2.5">Consumidor</th>
              <th className="px-3 py-2.5">Total</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((order) => {
              const status = orderStatus[order.status] || orderStatus.pending_payment;
              return (
                <tr key={order.id} className="border-t border-border/70 align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-foreground">{order.order_number}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {order.offer_title} · {order.quantity} u.
                    </p>
                    <p className="text-[10px] text-muted-foreground">{dateLabel(order.created_at)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <p>{order.user_name || '—'}</p>
                    <p className="text-[10px]">{order.user_email}</p>
                    <p className="text-[10px]">Código {order.pickup_code}</p>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-foreground">{ars(order.total)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses[status.tone]}`}>
                      {status.label}
                    </span>
                    {order.redeemed_at && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" /> {order.redeemed_by}
                      </p>
                    )}
                    {order.payment_status && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {order.payment_status}
                        {order.payment_environment ? ` · ${order.payment_environment}` : ''}
                      </p>
                    )}
                    {order.refund_required && (
                      <p className="mt-1 text-[10px] font-semibold text-destructive">Reembolso pendiente</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {['pending_payment', 'paid'].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => cancel(order)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          Cancelar
                        </button>
                      )}
                      {['pending_payment', 'paid'].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => reconcile(order)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          Conciliar
                        </button>
                      )}
                      {(order.refund_required || ['paid', 'picked_up'].includes(order.status)) && (
                        <button
                          type="button"
                          onClick={() => refund(order)}
                          className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          <RotateCcw className="h-3 w-3" /> Reembolsar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No hay pedidos con ese estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}