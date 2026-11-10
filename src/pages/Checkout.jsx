import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Clock, Loader2, Lock, MapPin, ShieldCheck, Timer, XCircle } from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { callFunction } from '../lib/callFunction';
import { useSession } from '../hooks/useSession';
import { ars, pickupWindow, saving } from '../lib/format';

import PageHeader from '../components/PageHeader';
import SignInCard from '../components/SignInCard';

export default function Checkout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: sessionLoading } = useSession();
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [reservation, setReservation] = useState(null);
  const [now, setNow] = useState(Date.now());
  const idempotency = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const quantity = Math.min(Math.max(Number(params.get('cantidad')) || 1, 1), 5);

  useEffect(() => {
    let alive = true;

    async function loadOffer() {
      const { data, error: loadError } = await supabase
        .from('offers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!alive) return;
      if (loadError) console.error('Error cargando la oferta:', loadError);
      setOffer(loadError ? null : data);
      setLoading(false);
    }

    loadOffer();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!reservation) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [reservation]);

  const reserve = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await callFunction('createCheckout', {
        offer_id: id,
        quantity,
        idempotency_key: idempotency.current,
      });
      if (data?.init_point) {
        setReservation(data);
        setNow(Date.now());
        return;
      }
      setError(data?.message || 'No pudimos iniciar el pago.');
    } catch (err) {
      setError(err.detail?.message || err.detail?.error || 'No pudimos iniciar el pago. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const cancelReservation = async () => {
    if (!reservation) return;
    setCancelling(true);
    setError('');
    try {
      await callFunction('cancelOrder', { order_id: reservation.order_id });
      setReservation(null);
      navigate(`/oferta/${id}`);
    } catch (err) {
      setError(err.detail?.error || 'No pudimos cancelar la reserva.');
    } finally {
      setCancelling(false);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div>
        <PageHeader title="Confirmar reserva" back={`/oferta/${id}`} />
        <div className="space-y-3">
          <div className="shimmer h-28 rounded-[26px]" />
          <div className="shimmer h-40 rounded-[26px]" />
          <div className="shimmer h-24 rounded-[26px]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="Confirmar reserva" subtitle="Necesitás una cuenta" back={`/oferta/${id}`} />
        <SignInCard
          title="Ingresá para reservar"
          message="Tu reserva queda asociada a tu cuenta para que puedas mostrar el código QR al retirar."
        />
      </div>
    );
  }

  if (!offer) {
    return (
      <div>
        <PageHeader title="Confirmar reserva" back="/explorar" />
        <p className="text-[13px] text-muted-foreground">La oferta ya no está disponible.</p>
      </div>
    );
  }

  const minutesLeft = reservation?.reserved_until
    ? Math.max(Math.ceil((new Date(reservation.reserved_until).getTime() - now) / 60000), 0)
    : null;
  const total = reservation ? Number(reservation.total) || 0 : Number(offer.rescue_price) * quantity;

  return (
    <div className="pb-40">
      <PageHeader
        title={reservation ? 'Reserva bloqueada' : 'Confirmar reserva'}
        subtitle={reservation ? 'Revisá los datos y pagá' : 'Revisá y reservá en un paso'}
        back={`/oferta/${id}`}
      />

      <div className="fade-up rounded-[26px] bg-card p-4 ring-1 ring-border/60" style={{ boxShadow: 'var(--shadow-soft)' }}>
        <div className="flex gap-3.5">
          <img
            src={offer.image_url}
            alt={offer.title}
            loading="lazy"
            className="h-[88px] w-[88px] shrink-0 rounded-[20px] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.14em] text-primary/80">
              {offer.business_name}
            </p>
            <p className="mt-1 line-clamp-2 font-heading text-[14.5px] font-semibold leading-snug text-foreground">
              {offer.title}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {quantity} × {ars(offer.rescue_price)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-border/70 pt-3.5 text-[12.5px] text-muted-foreground">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
            {offer.business_address}
          </p>
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
            {offer.pickup_date ? `${offer.pickup_date} · ` : ''}
            {pickupWindow(offer.pickup_start, offer.pickup_end)}
          </p>
        </div>
      </div>

      {reservation && (
        <div className="fade-up mt-3 rounded-[26px] bg-sage/70 p-4 text-forest ring-1 ring-primary/10">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
            <Timer className="h-4 w-4" />
            {minutesLeft && minutesLeft > 0 ? `Reservado por ${minutesLeft} min` : 'Reserva por vencer'}
          </p>
          <p className="mt-1.5 font-heading text-[14px] font-bold">Pedido {reservation.order_number}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-forest/80">
            Bloqueamos {quantity} paquete{quantity > 1 ? 's' : ''} a tu nombre. Completá el pago para
            confirmar el retiro; si el pago no se acredita, las unidades se liberan solas.
          </p>
          {reservation.payment_environment === 'test' && (
            <p className="mt-2 inline-block rounded-full bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-clay">
              Entorno de pruebas
            </p>
          )}
        </div>
      )}

      <div className="mt-3 rounded-[26px] bg-card p-4 ring-1 ring-border/60">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium text-foreground">{ars(total)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Ahorro estimado</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-bold text-secondary-foreground">
            {ars(saving(offer.original_price, offer.rescue_price) * quantity)}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-border/70 pt-3">
          <span className="text-[13px] font-semibold text-foreground">Total a pagar</span>
          <span className="font-display text-[28px] font-semibold leading-none text-forest">{ars(total)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-[22px] bg-sage/70 p-3.5 text-[11.5px] leading-relaxed text-forest">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        {reservation
          ? 'El cobro se hace en Mercado Pago. No guardamos datos de tu tarjeta: solo registramos el estado del pago.'
          : 'Al confirmar bloqueamos las unidades por 20 minutos y abrís el pago en Mercado Pago. El retiro es presencial: no incluye envío.'}
      </div>

      {!reservation && (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[22px] bg-card p-4 text-[11.5px] leading-relaxed text-muted-foreground ring-1 ring-border/60">
          <input
            type="checkbox"
            checked={terms}
            onChange={(event) => setTerms(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
          />
          <span>
            Acepto los{' '}
            <Link to="/legal/terminos" className="font-semibold text-primary underline">
              términos de compra
            </Link>{' '}
            y la{' '}
            <Link to="/legal/privacidad" className="font-semibold text-primary underline">
              política de privacidad
            </Link>
            . Entiendo que el contenido de las cajas sorpresa es variable.
          </span>
        </label>
      )}

      {error && (
        <div className="fade-up mt-3 flex gap-2.5 rounded-[20px] bg-destructive/8 p-3.5 text-[12px] leading-relaxed text-destructive ring-1 ring-destructive/15">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/compras')}
        className="mt-3 w-full py-2 text-center text-[12px] font-semibold text-muted-foreground"
      >
        Ver mis reservas
      </button>

      <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-[560px]">
          {reservation ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = reservation.init_point;
                }}
                className="btn-primary press h-[54px] w-full"
              >
                <Lock className="h-4 w-4" /> Ir a pagar con Mercado Pago
              </button>
              <button
                type="button"
                onClick={cancelReservation}
                disabled={cancelling}
                className="press flex h-9 w-full items-center justify-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                {cancelling ? 'Liberando unidades…' : 'Cancelar la reserva y liberar el stock'}
              </button>
            </div>
          ) : (
            <>
              <button type="button" onClick={reserve} disabled={!terms || busy} className="btn-primary press h-[54px] w-full">
                {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Lock className="h-4 w-4" />}
                {busy ? 'Bloqueando tus paquetes…' : `Reservar y pagar ${ars(total)}`}
              </button>
              <p className="mt-1.5 text-center text-[10.5px] font-medium text-muted-foreground">
                Reservamos el stock antes de abrir Mercado Pago
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
