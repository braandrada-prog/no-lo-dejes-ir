import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import PriceTag from './PriceTag';
import { pct, pickupWindow } from '../lib/format';

export default function HeroOffer({ offer }) {
  if (!offer) return null;

  const discount = offer.discount_percent || pct(offer.original_price, offer.rescue_price);

  return (
    <Link
      to={`/oferta/${offer.id}`}
      className="press group relative block overflow-hidden rounded-[32px] bg-ink ring-1 ring-ink/10"
      style={{ boxShadow: '0 30px 60px -38px rgba(10, 38, 26, 0.85)' }}
    >
     <img
      src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1000&q=80"
      alt="Alimentos frescos"
      className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none"
    />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span className="rounded-full bg-card/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground backdrop-blur-md ring-1 ring-white/20">
          Oportunidad del día
        </span>
        {discount > 0 && (
          <span className="rounded-full bg-secondary px-2.5 py-1.5 text-[12px] font-extrabold leading-none text-secondary-foreground">
            −{discount}%
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-primary-foreground/80">
          <MapPin className="h-3.5 w-3.5" />
          {offer.merchant_name || offer.business_name}
          <span className="text-primary-foreground/40">·</span>
          {pickupWindow(offer.pickup_start, offer.pickup_end)}
        </div>
        <h3 className="mt-1.5 max-w-[22ch] font-display text-[27px] leading-[1.12] text-primary-foreground">
          {offer.title}
        </h3>

        <div className="mt-3.5 flex items-end justify-between gap-3">
          <PriceTag offer={offer} size="md" tone="light" />
          <span className="press flex h-12 shrink-0 items-center gap-2 rounded-full bg-primary-foreground px-5 text-[13px] font-bold text-forest">
            Reservar
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
