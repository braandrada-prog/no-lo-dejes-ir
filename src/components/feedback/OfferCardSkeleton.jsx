import { cn } from '../../lib/utils';

export default function OfferCardSkeleton({ variant = 'row' }) {
  const tile = variant === 'tile';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[28px] bg-card ring-1 ring-border/60',
        tile && 'w-[268px] shrink-0'
      )}
    >
      <div className={cn('shimmer', tile ? 'aspect-[4/3]' : 'aspect-[16/10]')} />
      <div className="space-y-2.5 p-4">
        <div className="shimmer h-2.5 w-24 rounded-full" />
        <div className="shimmer h-4 w-[80%] rounded-full" />
        <div className="shimmer h-6 w-32 rounded-full" />
        <div className="shimmer h-3 w-40 rounded-full" />
      </div>
    </div>
  );
}