import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Leaf, Package, PiggyBank, Receipt, ShoppingBag } from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';
import SignInCard from '../components/SignInCard';
import EmptyState from '../components/feedback/EmptyState';
import { ars, dateLabel, orderStatus, pickupWindow, statusClasses } from '../lib/format';
import { cn } from '../lib/utils';

const ACTIVE = ['pending_payment', 'paid'];

export default function Purchases() {
  const { user, loading: sessionLoading } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('activas');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }
    let alive = true;

    async function loadOrders() {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false })
        .limit(60);

      if (!alive) return;
      if (error) console.error('Error cargando compras:', error);
      setOrders(error ? [] : data ?? []);
      setLoading(false);
    }

    loadOrders();
    return () => {
      alive = false;
    };
  }, [user]);

  // Cargando sesión
  if (sessionLoading) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Mis compras
          </h1>
        </header>
        <div className="mt-5 space-y-3">
          <div className="shimmer h-24 rounded-[26px]" />
          <div className="shimmer h-24 rounded-[26px]" />
        </div>
      </div>
    );
  }

  // Usuario no logueado
  if (!user) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Mis compras
          </h1>
        </header>
        <div className="mt-5">
          <SignInCard title="Mirá tus reservas" message="Ingresá para ver tus compras, códigos de retiro y ahorro acumulado." />
        </div>
      </div>
    );
  }

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const history = orders.filter((o) => !ACTIVE.includes(o.status));
  const shown = tab === 'activas' ? active : history;
  const picked = orders.filter((o) => o.status === 'picked_up');
  const totalSaved = orders
    .filter((o) => ['paid', 'picked_up'].includes(o.status))
    .reduce((sum, o) => sum + (Number(o.savings) || 0), 0);
  const estimatedKg = Math.round(picked.reduce((sum, o) => sum + Number(o.quantity || 0), 0) * 12) / 10;

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header Fijo */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <div>
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Mis compras
          </h1>
          <p className="text-[11.5px] font-medium text-slate-500">
            Reservas, retiros y ahorro
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50">
          <ShoppingBag className="h-4 w-4" />
        </div>
      </header>

      {/* Métricas del Usuario */}
      <section className="mt-5">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[22px] bg-gradient-to-br from-amber-500 to-amber-600 p-3.5 text-white shadow-xs">
            <PiggyBank className="h-[18px] w-[18px] text-amber-100" strokeWidth={1.8} />
            <p className="mt-2 font-heading text-[18px] font-black leading-none">{ars(totalSaved)}</p>
            <p className="mt-1 text-[10.5px] font-Montserrat text-amber-100">Ahorrados</p>
          </div>
          <div className="rounded-[22px] bg-white p-3.5 border border-slate-200/80 shadow-xs">
            <Package className="h-[18px] w-[18px] text-emerald-600" strokeWidth={1.8} />
            <p className="mt-2 font-heading text-[18px] font-bold leading-none text-slate-900">{picked.length}</p>
            <p className="mt-1 text-[10.5px] font-Montserrat text-slate-500">Retirados</p>
          </div>
          <div className="rounded-[22px] bg-white p-3.5 border border-slate-200/80 shadow-xs">
            <Leaf className="h-[18px] w-[18px] text-emerald-600" strokeWidth={1.8} />
            <p className="mt-2 font-heading text-[18px] font-bold leading-none text-slate-900">{estimatedKg} kg</p>
            <p className="mt-1 text-[10.5px] font-Montserrat text-slate-500">Rescatado</p>
          </div>
        </div>
        <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-slate-500">
          Estimación orientativa: 1,2 kg promedio por paquete rescatado. No es una medición verificada.
        </p>
      </section>

      {/* Pestañas Activas / Historial */}
      <section className="mt-5">
        <div className="flex gap-2">
          {['activas', 'historial'].map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'press h-10 rounded-full px-4 text-[12.5px] font-bold capitalize transition-all shadow-xs',
                tab === key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              )}
            >
              {key} ({key === 'activas' ? active.length : history.length})
            </button>
          ))}
        </div>
      </section>

      {/* Listado de Compras */}
      <section className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="shimmer h-24 rounded-[26px]" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={tab === 'activas' ? 'No tenés reservas activas' : 'Todavía no hay historial'}
            description="Cuando rescates un paquete lo vas a ver acá, con su código de retiro."
            action={{ label: 'Explorar ofertas', to: '/explorar' }}
          />
        ) : (
          <div className="space-y-3">
            {shown.map((order) => {
              const status = orderStatus[order.status] || orderStatus.pending_payment;
              return (
                <Link
                  key={order.id}
                  to={`/compras/${order.id}`}
                  className="press block rounded-[26px] bg-white p-3.5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition"
                >
                  <div className="flex items-start gap-3">
                    {order.image_url ? (
                      <img
                        src={order.image_url}
                        alt={order.offer_title}
                        loading="lazy"
                        className="h-[72px] w-[72px] shrink-0 rounded-[18px] object-cover"
                      />
                    ) : (
                      <div className="h-[72px] w-[72px] shrink-0 rounded-[18px] bg-slate-100 flex items-center justify-center text-slate-400">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
                          {order.business_name}
                        </p>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[14px] font-bold text-slate-900">{order.offer_title}</p>
                      <p className="mt-0.5 text-[11.5px] font-medium text-slate-500">
                        {order.quantity} × {ars(order.unit_price)} · {dateLabel(order.pickup_date || order.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${statusClasses[status.tone]}`}>
                          {status.label}
                        </span>
                        <span className="text-[10.5px] font-medium text-slate-500">
                          {pickupWindow(order.pickup_start, order.pickup_end)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}