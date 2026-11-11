import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronLeft,
  Clock,
  Heart,
  Info,
  MapPin,
  Navigation,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';
import PriceTag from '../components/PriceTag';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import { ars, distanceLabel, pickupWindow } from '../lib/format';
import { distanceKm, mapsLink } from '../lib/geo';
import { CITIES } from '../lib/categories';
import { cn } from '../lib/utils';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80';

export default function OfferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [favorite, setFavorite] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadOffer() {
      setLoading(true);
      setLoadError(false);

      const { data, error } = await supabase
        .from('public_offers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error('Error cargando la oferta:', error);
        setLoadError(true);
        setOffer(null);
      } else {
        setOffer(data ? { ...data, image_url: data.image_url || FALLBACK_IMG } : null);
      }
      setLoading(false);
    }

    loadOffer();
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (!user || !id) return undefined;
    let alive = true;

    async function loadFavorite() {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_email', user.email)
        .eq('offer_id', id)
        .eq('type', 'offer')
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (error) console.error('Error cargando favoritos:', error);
      setFavorite(data ?? null);
    }

    loadFavorite();
    return () => {
      alive = false;
    };
  }, [user, id]);

  const toggleFavorite = async () => {
    if (!user) return navigate('/perfil');

    if (favorite) {
      const { error } = await supabase.from('favorites').delete().eq('id', favorite.id);
      if (error) {
        console.error('No se pudo quitar el favorito:', error);
        return;
      }
      setFavorite(null);
      return;
    }

    const { data, error } = await supabase
      .from('favorites')
      .insert({
        user_email: user.email,
        type: 'offer',
        offer_id: id,
        business_id: offer?.business_id || null,
        business_name: offer?.merchant_name || '',
      })
      .select()
      .single();
    if (error) {
      console.error('No se pudo guardar el favorito:', error);
      return;
    }
    setFavorite(data);
  };

  if (loading) {
    return (
      <div className="-mx-5">
        <div className="shimmer h-[360px] w-full" />
        <div className="space-y-3 px-5 pt-6">
          <div className="shimmer h-3 w-28 rounded-full" />
          <div className="shimmer h-8 w-[80%] rounded-full" />
          <div className="shimmer h-3 w-40 rounded-full" />
          <div className="shimmer mt-4 h-10 w-52 rounded-full" />
          <div className="shimmer mt-4 h-24 w-full rounded-[24px]" />
          <div className="shimmer h-40 w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pt-4">
        <ErrorState
          title="No pudimos cargar esta oferta"
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="pt-4">
        <EmptyState
          title="Esta oferta ya no está disponible"
          description="Puede que se haya agotado o que el comercio la haya pausado."
          action={{ label: 'Ver otras ofertas', to: '/explorar' }}
        />
      </div>
    );
  }

  const available = Number(offer.quantity_available) || 0;
  const total = Number(offer.rescue_price) * quantity;
  const km = distanceKm(
    CITIES.find((c) => c.name?.toLowerCase() === offer.city?.toLowerCase()),
    offer
  );
  const low = available > 0 && available <= 3;

  return (
    <div className="-mx-5">
      <div className="relative">
        <img src={offer.image_url} alt={offer.title} className="h-[360px] w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/25" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur"
          >
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-label="Guardar en favoritos"
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-card/90 shadow-sm backdrop-blur"
          >
            <Heart
              className={cn('h-[18px] w-[18px] transition', favorite ? 'fill-destructive text-destructive' : 'text-foreground')}
              strokeWidth={2}
            />
          </button>
        </div>

        {low && (
          <span className="absolute bottom-4 left-5 flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-[11.5px] font-bold text-clay backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Últimas {available} unidades
          </span>
        )}
      </div>

      <div className="px-5 pb-44 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">
            <BadgeCheck className="h-4 w-4" />
            {offer.merchant_name || 'Comercio local'}
          </div>
          {Number(offer.rating) > 0 && (
            <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-bold text-yellow-600">
              ★ {Number(offer.rating).toFixed(1)}
            </span>
          )}
        </div>

        <h1 className="mt-2 font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-foreground">
          {offer.title}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          {offer.category || 'Pack Sorpresa'} · {offer.city}
        </p>

        <div className="mt-4">
          <PriceTag offer={offer} size="lg" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <div className="rounded-[20px] bg-card px-2 py-3 text-center ring-1 ring-border/60">
            <Clock className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1.5 text-[12px] font-bold leading-tight text-foreground">
              {pickupWindow(offer.pickup_start, offer.pickup_end)}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Retiro</p>
          </div>
          <div className="rounded-[20px] bg-card px-2 py-3 text-center ring-1 ring-border/60">
            <MapPin className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1.5 text-[12px] font-bold leading-tight text-foreground">
              {km != null ? distanceLabel(km) : offer.city}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Distancia</p>
          </div>
          <div className="rounded-[20px] bg-card px-2 py-3 text-center ring-1 ring-border/60">
            <Users className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1.5 text-[12px] font-bold leading-tight text-foreground">
              {available > 0 ? `${available}` : 'Agotado'}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Disponibles</p>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-heading text-[15px] font-bold text-foreground">Qué incluye</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{offer.description}</p>
          <div className="mt-3 flex gap-2.5 rounded-[20px] bg-accent/10 p-3.5 text-[12px] leading-relaxed text-clay ring-1 ring-accent/15">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Es una caja sorpresa: el contenido exacto varía según los excedentes del día. Todos los
            productos son aptos para consumo y se entregan en el horario indicado.
          </div>
        </section>

        {offer.merchant_address && (
          <section className="mt-5 space-y-2.5">
            <a
              href={mapsLink(offer.merchant_address)}
              target="_blank"
              rel="noreferrer"
              className="press flex items-center gap-3 rounded-[22px] bg-card p-4 ring-1 ring-border/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage text-forest">
                <Navigation className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Punto de retiro
                </span>
                <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-foreground">
                  {offer.merchant_address}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                  {pickupWindow(offer.pickup_start, offer.pickup_end)}
                </span>
              </span>
              <span className="text-[11.5px] font-bold text-primary">Mapa</span>
            </a>
          </section>
        )}

        <div className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Venta de alimentos excedentes aptos para consumo. El retiro es presencial en el comercio
          dentro del horario publicado.
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[560px] items-center gap-2.5">
          <div className="flex h-[52px] items-center rounded-full bg-card ring-1 ring-border/70">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-[52px] w-11 text-[20px] font-medium text-foreground/70 disabled:opacity-40"
              disabled={available === 0}
              aria-label="Quitar una unidad"
            >
              −
            </button>
            <span className="w-6 text-center text-[15px] font-bold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(Math.min(available, 5), q + 1))}
              className="h-[52px] w-11 text-[20px] font-medium text-foreground/70 disabled:opacity-40"
              disabled={available === 0}
              aria-label="Agregar una unidad"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/checkout/${offer.id}?cantidad=${quantity}`)}
            disabled={available === 0}
            className="btn-primary press h-[52px] flex-1"
          >
            {available === 0 ? 'Sin stock' : `Reservar · ${ars(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}