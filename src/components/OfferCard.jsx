import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, MapPin } from 'lucide-react';
import PriceTag from './PriceTag';
import { distanceLabel, pct, pickupWindow } from '../lib/format';
import { cn } from '../lib/utils';

export default function OfferCard({ offer, variant = 'row' }) {
  const tile = variant === 'tile';
  const available = Number(offer.quantity_available) || 0;
  const low = available > 0 && available <= 3;
  const discount = offer.discount_percent || pct(offer.original_price, offer.rescue_price);

  return (
    <Link
      to={`/oferta/${offer.id}`}
      className={cn(
        'press group block overflow-hidden rounded-[28px] bg-card ring-1 ring-border/60',
        'hover:ring-primary/25',
        tile && 'w-[268px] shrink-0'
      )}
      style={{ boxShadow: 'var(--shadow-soft)' }}
    >
      <div className="relative overflow-hidden">
        <img
          src={offer.image_url}
          alt={offer.title}
          loading="lazy"
          className={cn(
            'w-full object-cover transition duration-700 group-hover:scale-[1.045]',
            tile ? 'aspect-[4/3]' : 'aspect-[16/10]'
          )}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {discount > 0 && (
            <span className="rounded-full bg-secondary px-2.5 py-1.5 text-[12px] font-extrabold leading-none text-secondary-foreground shadow-sm">
              −{discount}%
            </span>
          )}
          {low ? (
            <span className="flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1.5 text-[11px] font-bold leading-none text-clay shadow-sm backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Últimas {available}
            </span>
          ) : (
            <span className="rounded-full bg-card/90 px-2.5 py-1.5 text-[11px] font-bold leading-none text-forest shadow-sm backdrop-blur">
              Quedan {available}
            </span>
          )}
        </div>

        {offer.is_demo && (
          <span className="absolute bottom-3 left-3 rounded-full bg-ink/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
            demo
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-primary/70">
          {offer.business_name}
        </p>
        <h3 className="mt-1.5 line-clamp-2 font-heading text-[16px] font-semibold leading-[1.3] text-foreground">
          {offer.title}
        </h3>

        <PriceTag offer={offer} className="mt-2.5" />

        <div className="mt-3 flex items-center gap-3 border-t border-border/70 pt-3 text-[12px] font-medium text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{distanceLabel(offer.distance_km) || offer.city}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{pickupWindow(offer.pickup_start, offer.pickup_end)}</span>
          </span>
          <ArrowUpRight className="ml-auto hidden h-4 w-4 shrink-0 text-primary opacity-0 transition group-hover:opacity-100 sm:block" />
        </div>
      </div>
    </Link>
  );
}