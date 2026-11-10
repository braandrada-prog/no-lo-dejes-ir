import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import OfferCard from '../components/OfferCard';
import OfferCardSkeleton from '../components/feedback/OfferCardSkeleton';
import EmptyState from '../components/feedback/EmptyState';
import SignInCard from '../components/SignInCard';
import { useSession } from '../hooks/useSession';

export default function Favorites() {
  const { user, loading: sessionLoading } = useSession();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    let alive = true;

    async function fetchFavorites() {
      setLoading(true);

      // 1. IDs de las ofertas guardadas por el usuario (la tabla favorites usa user_email)
      const { data: favs, error: favError } = await supabase
        .from('favorites')
        .select('offer_id')
        .eq('user_email', user.email)
        .eq('type', 'offer');

      if (!alive) return;
      if (favError || !favs || favs.length === 0) {
        if (favError) console.error('Error cargando favoritos:', favError);
        setOffers([]);
        setLoading(false);
        return;
      }

      const offerIds = [...new Set(favs.map((f) => f.offer_id).filter(Boolean))];

      // 2. Detalle de esas ofertas (RLS solo deja ver las activas o agotadas)
      const { data: offerData, error: offerError } = await supabase
        .from('offers')
        .select('*')
        .in('id', offerIds);

      if (!alive) return;
      if (offerError) console.error('Error cargando ofertas favoritas:', offerError);
      setOffers(offerError ? [] : offerData ?? []);
      setLoading(false);
    }

    fetchFavorites();

    return () => {
      alive = false;
    };
  }, [user]);

  // Pantalla de Carga de Sesión
  if (sessionLoading) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Favoritos
          </h1>
        </header>
        <div className="mt-5 space-y-3">
          <div className="shimmer h-40 rounded-[28px]" />
          <div className="shimmer h-40 rounded-[28px]" />
        </div>
      </div>
    );
  }

  // Pantalla Sin Sesión Iniciada
  if (!user) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Favoritos
          </h1>
        </header>
        <div className="mt-5">
          <SignInCard
            title="Guardá lo que te gusta"
            message="Ingresá para guardar ofertas y comercios y recibir avisos de nuevas publicaciones."
          />
        </div>
      </div>
    );
  }

  // Pantalla Principal de Favoritos
  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header Fijo con Blur */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <div>
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Favoritos
          </h1>
          <p className="text-[11.5px] font-medium text-slate-500">
            Lo que guardaste para rescatar después
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 ring-1 ring-rose-200/50">
          <Heart className="h-4 w-4 fill-rose-500" />
        </div>
      </header>

      {/* Contenido */}
      <section className="mt-5">
        {loading ? (
          <div className="grid gap-3.5">
            {[0, 1].map((i) => (
              <OfferCardSkeleton key={i} />
            ))}
          </div>
        ) : offers.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Todavía no guardaste ofertas"
            description="Tocá el corazón en cualquier oferta para tenerla a mano."
            action={{ label: 'Explorar ofertas', to: '/explorar' }}
          />
        ) : (
          <div className="grid gap-3.5">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}