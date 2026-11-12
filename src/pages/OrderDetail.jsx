import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Navigation, Clock, CheckCircle2, AlertTriangle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { supabase } from '../services/supabaseClient';
import { callFunction } from '../lib/callFunction';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import { ars, dateLabel, orderStatus, pickupWindow, statusClasses } from '../lib/format';
import { mapsLink } from '../lib/geo';

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [now, setNow] = useState(Date.now());

  const fetchOrder = async () => {
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) console.error('Error cargando el pedido:', error);
    return error ? null : data;
  };

  useEffect(() => {
    let alive = true;

    async function loadOrder() {
      const record = await fetchOrder();
      if (!alive) return;
      setOrder(record);
      setLoading(false);
    }

    loadOrder();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useEffect(() => {
    if (order?.status !== 'pending_payment') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [order?.status]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(order.pickup_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const reload = async () => {
    const record = await fetchOrder();
    if (record) setOrder(record);
  };

  const verifyPayment = async () => {
    setBusy('verify');
    setNotice('');
    setActionError('');
    try {
      const data = await callFunction('mpReconcile', { order_id: order.id });
      if (data?.status === 'paid' || data?.status === 'paid_recovered') {
        setNotice('¡Pago confirmado! Tu QR de retiro ya está disponible.');
      } else if (data?.refund_required) {
        setNotice('Recibimos tu pago, pero la reserva ya no tenía stock. Estamos procesando el reintegro.');
      } else {
        setNotice('Todavía no aparece el pago acreditado. Si pagaste recién, esperá un minuto y volvé a verificar.');
      }
      await reload();
    } catch (err) {
      setActionError(err.detail?.message || err.detail?.error || 'No pudimos verificar el pago.');
    } finally {
      setBusy('');
    }
  };

  const cancelOrder = async () => {
    const paid = order.status === 'paid';
    const question = paid
      ? '¿Pedimos el reembolso de esta reserva? El QR quedará anulado.'
      : '¿Cancelar la reserva y liberar las unidades?';
    if (!window.confirm(question)) return;
    setBusy('cancel');
    setNotice('');
    setActionError('');
    try {
      const data = await callFunction('cancelOrder', {
        order_id: order.id,
        reason: paid ? 'Reembolso solicitado desde el detalle del pedido' : 'Cancelación desde el detalle del pedido',
      });
      if (data?.refund_pending) {
        setNotice(data.message || 'Registramos tu solicitud de reembolso.');
      } else if (data?.status === 'refunded') {
        setNotice('Reembolso procesado. El importe puede tardar algunos días en verse.');
      } else {
        setNotice('Reserva cancelada y unidades liberadas.');
      }
      await reload();
    } catch (err) {
      setActionError(err.detail?.error || err.detail?.message || 'No pudimos cancelar la reserva.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Tu reserva" back="/compras" />
        <div className="space-y-3">
          <div className="shimmer h-28 rounded-[28px]" />
          <div className="shimmer h-80 rounded-[28px]" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <PageHeader title="Tu reserva" back="/compras" />
        <EmptyState
          title="No encontramos esa reserva"
          description="Puede que el enlace sea viejo o que el pedido ya no exista."
          action={{ label: 'Ver mis compras', to: '/compras' }}
        />
      </div>
    );
  }

  const status = orderStatus[order.status] || orderStatus.pending_payment;
  const qrPayload = order.qr_token || order.pickup_code;
  // El QR solo se muestra con pago aprobado y token emitido en la confirmación.
  const canShowQr = order.status === 'paid' && Boolean(order.qr_token || order.pickup_code);
  const minutesLeft = order.reserved_until
    ? Math.max(Math.ceil((new Date(order.reserved_until).getTime() - now) / 60000), 0)
    : null;

  return (
    <div>
      <PageHeader title={`Pedido ${order.order_number}`} subtitle={dateLabel(order.created_at)} back="/compras" />

      {order.refund_required && (
        <div className="fade-up mb-3 flex gap-2.5 rounded-[20px] bg-accent/12 p-3.5 text-[11.5px] leading-relaxed text-clay ring-1 ring-accent/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Estamos procesando el reintegro de este pedido. No hace falta que hagas nada más.
        </div>
      )}

      {notice && (
        <div className="fade-up mb-3 rounded-[20px] bg-sage p-3.5 text-[11.5px] leading-relaxed text-forest">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="fade-up mb-3 rounded-[20px] bg-destructive/8 p-3.5 text-[11.5px] leading-relaxed text-destructive ring-1 ring-destructive/15">
          {actionError}
        </div>
      )}

      {canShowQr ? (
        <>
          <div className="pop-in relative overflow-hidden rounded-[30px] bg-primary px-5 py-5 text-primary-foreground">
            <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-primary-foreground/10" />
            <div className="relative flex items-center gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary">
                <Check className="h-6 w-6" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[23px] leading-tight">Reserva confirmada</p>
                <p className="mt-0.5 truncate text-[12px] text-primary-foreground/70">{order.business_name}</p>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between border-t border-primary-foreground/15 pt-3 text-[11.5px] text-primary-foreground/70">
              <span>{order.quantity} paquete{order.quantity > 1 ? 's' : ''}</span>
              <span>Pagado {ars(order.total)}</span>
            </div>
          </div>

          <div
            className="mt-4 overflow-hidden rounded-[30px] bg-card ring-1 ring-border/60"
            style={{ boxShadow: 'var(--shadow-soft)' }}
          >
            <div className="bg-sage px-5 py-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-forest/70">
                Mostrá este código al retirar
              </p>
              <p className="mt-1 text-[12px] text-forest/70">El comercio lo escanea para entregarte el paquete.</p>
            </div>

            <div className="px-5 pb-5 pt-5">
              {/* El QR se genera en el dispositivo: el token de retiro no se envía a ningún servicio externo. */}
              <div
                role="img"
                aria-label={`Código QR de la reserva ${order.order_number}`}
                className="mx-auto w-fit rounded-[22px] bg-white p-3 ring-1 ring-border"
              >
                <QRCodeSVG value={qrPayload} size={196} level="M" bgColor="#ffffff" fgColor="#000000" />
              </div>

              <p className="mt-4 text-center font-mono text-[21px] font-semibold tracking-[0.32em] text-foreground">
                {order.pickup_code}
              </p>

              <button
                type="button"
                onClick={copyCode}
                className="press mx-auto mt-3 flex h-11 items-center gap-2 rounded-full bg-secondary px-4 text-[12.5px] font-bold text-secondary-foreground"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Código copiado' : 'Copiar código'}
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                El código es de un solo uso. Una vez validado en el comercio no puede usarse de nuevo.
              </p>
            </div>

            <div className="border-t border-dashed border-border px-5 py-4">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Retiro</p>
              <p className="mt-1 text-[14px] font-semibold text-foreground">{order.business_name}</p>
              <p className="text-[12.5px] text-muted-foreground">{order.business_address}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {dateLabel(order.pickup_date)} · {pickupWindow(order.pickup_start, order.pickup_end)}
              </p>
              <a
                href={mapsLink(order.business_address)}
                target="_blank"
                rel="noreferrer"
                className="press mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-[12.5px] font-bold text-primary-foreground"
              >
                <Navigation className="h-3.5 w-3.5" /> Cómo llegar
              </a>
            </div>
          </div>
        </>
      ) : order.status === 'pending_payment' ? (
        <div className="fade-up rounded-[28px] bg-card p-6 text-center ring-1 ring-border/60">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent/12 text-clay">
            <Clock className="h-6 w-6" strokeWidth={1.9} />
          </span>
          <p className="mt-4 font-display text-[21px] leading-snug text-foreground">Estamos esperando el pago</p>
          <p className="mx-auto mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-muted-foreground">
            Tu reserva se libera si el pago no se confirma. Si ya pagaste, la confirmación puede demorar
            unos minutos.
          </p>
          {minutesLeft != null && minutesLeft > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sage px-3 py-1.5 text-[11.5px] font-bold text-forest">
              <AlertTriangle className="h-3.5 w-3.5" />
              Quedan ~{minutesLeft} min de reserva
            </p>
          )}
          <button
            type="button"
            onClick={verifyPayment}
            disabled={busy === 'verify'}
            className="press mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {busy === 'verify' ? 'Consultando el pago…' : 'Ya pagué: verificar'}
          </button>
          <button
            type="button"
            onClick={cancelOrder}
            disabled={busy === 'cancel'}
            className="press mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-secondary text-[12.5px] font-bold text-secondary-foreground disabled:opacity-60"
          >
            {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancelar reserva
          </button>
        </div>
      ) : (
        <div className="fade-up rounded-[28px] bg-card p-6 text-center ring-1 ring-border/60">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-muted text-muted-foreground">
            <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <span className={`mt-4 inline-block rounded-full px-3 py-1 text-[11.5px] font-bold ${statusClasses[status.tone]}`}>
            {status.label}
          </span>
          <p className="mx-auto mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-muted-foreground">
            {order.refund_reason || 'Este pedido no está activo.'}
          </p>
        </div>
      )}

      <div className="mt-4 rounded-[24px] bg-card p-4 ring-1 ring-border/60">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Detalle</p>
        <div className="mt-2.5 flex justify-between gap-3 text-[12.5px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{order.offer_title}</span>
          <span className="shrink-0">{order.quantity} paquete(s)</span>
        </div>
        <div className="mt-2 flex justify-between text-[12.5px] text-muted-foreground">
          <span>Precio unitario</span>
          <span>{ars(order.unit_price)}</span>
        </div>
        <div className="mt-2 flex justify-between text-[12.5px] text-muted-foreground">
          <span>Ahorro</span>
          <span className="font-semibold text-forest">{ars(order.savings)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
          <span className="text-[13px] font-semibold text-foreground">Total</span>
          <span className="font-display text-[20px] font-semibold text-forest">{ars(order.total)}</span>
        </div>
      </div>

      {order.status === 'paid' && (
        <div className="mt-4">
          <button
            type="button"
            onClick={cancelOrder}
            disabled={busy === 'cancel'}
            className="press h-12 w-full rounded-full bg-card text-[12.5px] font-semibold text-muted-foreground ring-1 ring-border/70 disabled:opacity-60"
          >
            {busy === 'cancel' ? 'Procesando el reembolso…' : 'Solicitar cancelación o reembolso'}
          </button>
        </div>
      )}
    </div>
  );
}