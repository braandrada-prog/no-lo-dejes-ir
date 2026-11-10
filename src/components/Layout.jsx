import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Heart, Home, Receipt, Search, User } from 'lucide-react';
import { cn } from '../lib/utils';

const items = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/explorar', label: 'Explorar', icon: Search },
  { to: '/favoritos', label: 'Favoritos', icon: Heart },
  { to: '/compras', label: 'Compras', icon: Receipt },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 55% at 50% -10%, hsl(var(--sage) / 0.6) 0%, hsl(var(--background)) 60%)',
        }}
      />

      <div className="mx-auto w-full max-w-[560px] px-5 pb-32">
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[560px] items-stretch justify-between px-3 pb-1.5 pt-2">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="press flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-[0_10px_20px_-14px_hsl(var(--primary))]'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.3 : 1.8} />
                  </span>
                  <span className={cn('transition-colors', isActive ? 'text-primary' : 'text-muted-foreground/80')}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
