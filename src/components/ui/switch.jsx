import { cn } from '../../lib/utils';

// Interruptor simple (sin dependencias). Misma interfaz que el de shadcn: checked / onCheckedChange.
export function Switch({ checked = false, onCheckedChange, disabled = false, className, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-amber-500' : 'bg-muted-foreground/30',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export default Switch;