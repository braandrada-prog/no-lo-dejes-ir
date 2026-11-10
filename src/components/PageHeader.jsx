import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PageHeader({ title, subtitle, back = '/', action }) {
  return (
    <div className="flex items-center gap-3 pb-5 pt-5">
      <Link
        to={back}
        aria-label="Volver"
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground/70 ring-1 ring-border/70"
      >
        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[24px] leading-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}