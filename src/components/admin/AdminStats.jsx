import { useEffect, useState } from 'react';
import { Building2, Package, Receipt, TrendingUp, Users } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import { ars, pct } from '../../lib/format';

export default function AdminStats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      const [orders, offers, businesses, users] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('businesses').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ]);

      if (!alive) return;

      const failed = [orders, offers, businesses, users].find((r) => r.error);
      if (failed) {
        console.error('Error cargando métricas:', failed.error);
        setError(true);
        return;
      }

      const orderList = orders.data ?? [];
      const offerList = offers.data ?? [];
      const paid = orderList.filter((o) => ['paid', 'picked_up'].includes(o.status));
      const gross = paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const commission = 15;

      setData({
        orders: orderList.length,
        paid: paid.length,
        picked: orderList.filter((o) => o.status === 'picked_up').length,
        refunded: orderList.filter((o) => o.status === 'refunded').length,
        gross,
        commission: Math.round((gross * commission) / 100),
        offersActive: offerList.filter((o) => o.status === 'active').length,
        offersSoldOut: offerList.filter((o) => o.status === 'sold_out').length,
        businesses: businesses.count ?? 0,
        users: users.count ?? 0,
        conversion: orderList.length ? Math.round((paid.length / orderList.length) * 100) : 0,
        cities: [...new Set(offerList.map((o) => o.city).filter(Boolean))],
        avgDiscount: offerList.length
          ? Math.round(
              offerList.reduce((sum, o) => sum + pct(o.original_price, o.rescue_price), 0) /
                offerList.length
            )
          : 0,
      });
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
        No pudimos cargar las métricas. Revisá la consola y las políticas de acceso de las tablas.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Ventas confirmadas', value: data.paid, icon: Receipt },
    { label: 'Volumen procesado', value: ars(data.gross), icon: TrendingUp },
    { label: 'Comisión estimada 15%', value: ars(data.commission), icon: TrendingUp },
    { label: 'Paquetes retirados', value: data.picked, icon: Package },
    { label: 'Ofertas activas', value: data.offersActive, icon: Package },
    { label: 'Ofertas agotadas', value: data.offersSoldOut, icon: Package },
    { label: 'Comercios', value: data.businesses, icon: Building2 },
    { label: 'Usuarios registrados', value: data.users, icon: Users },
    { label: 'Conversión de reservas', value: `${data.conversion}%`, icon: TrendingUp },
    { label: 'Reembolsos', value: data.refunded, icon: Receipt },
    { label: 'Descuento promedio', value: `${data.avgDiscount}%`, icon: TrendingUp },
    { label: 'Ciudades con actividad', value: data.cities.join(' · ') || '—', icon: Building2 },
  ];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-heading text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Las métricas se calculan sobre los últimos 300 pedidos y ofertas. La comisión mostrada es una
        estimación configurable en «Configuración».
      </p>
    </div>
  );
}