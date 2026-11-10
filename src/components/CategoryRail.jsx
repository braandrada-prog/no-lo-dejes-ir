import { Link } from 'react-router-dom';
import { CATEGORIES } from '../lib/categories';
import { cn } from '../lib/utils';

export default function CategoryRail({ active = '', compact = false }) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {CATEGORIES.map(({ name, icon: Icon }) => {
        const isActive = active === name;
        return (
          <Link
            key={name}
            to={`/explorar?categoria=${encodeURIComponent(name)}`}
            className={cn(
              'press flex shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ring-1',
              compact ? 'h-10' : 'h-11',
              isActive
                ? 'bg-primary text-primary-foreground ring-primary'
                : 'bg-card text-foreground/75 ring-border/70 hover:text-primary hover:ring-primary/30'
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.9} />
            {name}
          </Link>
        );
      })}
    </div>
  );
}
