import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';

export default function EmptyState({ icon: Icon = Leaf, title, description, action }) {
  return (
    <div className="fade-up mt-6 flex flex-col items-center rounded-[28px] border border-dashed border-primary/25 bg-card/70 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-sage text-forest">
        <Icon className="h-6 w-6" strokeWidth={1.7} />
      </span>
      <p className="mt-4 max-w-[26ch] font-display text-[20px] leading-snug text-foreground">{title}</p>
      {description && (
        <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action?.to && (
        <Link to={action.to} className="btn-primary press mt-5 h-12 px-6">
          {action.label}
        </Link>
      )}
      {action?.onClick && (
        <button type="button" onClick={action.onClick} className="btn-primary press mt-5 h-12 px-6">
          {action.label}
        </button>
      )}
    </div>
  );
}