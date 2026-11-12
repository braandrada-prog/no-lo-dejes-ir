import { ars, pct, saving } from '../lib/format';
import { cn } from '../lib/utils';

const SIZES = {
  sm: 'text-[20px]',
  md: 'text-[24px]',
  lg: 'text-[36px]',
};

export default function PriceTag({ offer, size = 'sm', tone = 'dark', className }) {
  const light = tone === 'light';
  const off = offer.discount_percent || pct(offer.original_price, offer.rescue_price);
  const save = saving(offer.original_price, offer.rescue_price);

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1.5', className)}>
      <span
        className={cn(
          'font-display font-semibold leading-none tracking-[-0.02em]',
          SIZES[size],
          light ? 'text-primary-foreground' : 'text-forest'
        )}
      >
        {ars(offer.rescue_price)}
      </span>
      <span
        className={cn(
          'text-[13px] font-medium line-through',
          light ? 'text-primary-foreground/60' : 'text-muted-foreground'
        )}
      >
        {ars(offer.original_price)}
      </span>
      {save > 0 && (
        <span
          className={cn(
            'rounded-full px-2 py-[3px] text-[11px] font-bold leading-none',
            light ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-secondary text-secondary-foreground'
          )}
        >
          {off > 0 ? `${off}% menos` : `Ahorrás ${ars(save)}`}
        </span>
      )}
    </div>
  );
}
