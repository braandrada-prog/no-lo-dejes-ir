import { RefreshCw, WifiOff } from 'lucide-react';

export default function ErrorState({ title = 'No pudimos cargar las ofertas', description, onRetry }) {
  return (
    <div className="fade-up mt-6 flex flex-col items-center rounded-[28px] border border-border bg-card/70 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-muted text-muted-foreground">
        <WifiOff className="h-6 w-6" strokeWidth={1.7} />
      </span>
      <p className="mt-4 max-w-[26ch] font-display text-[20px] leading-snug text-foreground">{title}</p>
      <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">
        {description || 'Revisá tu conexión e intentá de nuevo. Tu reserva y tus datos siguen seguros.'}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-soft press mt-5 h-12 px-6">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      )}
    </div>
  );
}