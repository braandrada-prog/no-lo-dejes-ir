import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import PageHeader from '../components/PageHeader';
import SignInCard from '../components/SignInCard';
import EmptyState from '../components/feedback/EmptyState';
import { useSession } from '../hooks/useSession';

export default function Notifications() {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_email', user.email)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) console.error('Error cargando notificaciones:', error);
    setItems(error ? [] : data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const markAll = async () => {
    const unreadIds = items.filter((item) => !item.read).map((item) => item.id);
    if (!unreadIds.length) return;

    const { error } = await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    if (error) {
      console.error('No se pudieron marcar como leídas:', error);
      return;
    }
    setItems(items.map((item) => ({ ...item, read: true })));
  };

  if (sessionLoading) {
    return (
      <div>
        <PageHeader title="Notificaciones" back="/perfil" />
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-20 rounded-[22px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader title="Notificaciones" back="/perfil" />
        <SignInCard title="Tus avisos" message="Ingresá para ver las novedades de tus reservas y ofertas." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        subtitle="Compras, retiros y novedades"
        back="/perfil"
        action={
          items.some((item) => !item.read) ? (
            <button
              type="button"
              onClick={markAll}
              className="press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 text-[11.5px] font-bold text-secondary-foreground ring-1 ring-secondary"
            >
              <Check className="h-3.5 w-3.5" /> Leídas
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-20 rounded-[22px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Sin notificaciones por ahora"
          description="Te avisamos cuando se confirme un pago o tengas que retirar un pedido."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.link || '/compras'}
              className={`press block rounded-[22px] p-4 ring-1 ${
                item.read ? 'bg-card ring-border/60' : 'bg-sage/70 ring-primary/15'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-accent'}`}
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.message}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}