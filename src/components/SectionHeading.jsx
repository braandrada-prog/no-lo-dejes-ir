import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function SectionHeading({ title, subtitle, to, toLabel = 'Ver todo' }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-[16px] font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className="press inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-3 py-1.5 text-[12px] font-semibold text-primary ring-1 ring-border/70"
        >
          {toLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}