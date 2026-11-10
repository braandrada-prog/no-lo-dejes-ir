import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, ChevronDown, Leaf, MapPin, Search, Sparkles, Sprout } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';

import CategoryRail from '../components/CategoryRail';
import OfferCard from '../components/OfferCard';
import HeroOffer from '../components/HeroOffer';
import SectionHeading from '../components/SectionHeading';
import OfferCardSkeleton from '../components/feedback/OfferCardSkeleton';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';

import { pct } from '../lib/format';
import { useCity } from '../hooks/useCity';
import { useOffers } from '../hooks/useOffers';

export default function Home() {
  const navigate = useNavigate();
  const [city, setCity] = useCity();

  // Solicitar permiso y obtener la ubicación real traducida a ciudad
  useEffect(() => {
    const requestLocationAndSetCity = async () => {
      try {
        let permissionStatus = await Geolocation.checkPermissions();

        if (permissionStatus.location !== 'granted') {
          permissionStatus = await Geolocation.requestPermissions();
        }

        if (permissionStatus.location === 'granted') {
          const coordinates = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
          });

          const { latitude, longitude } = coordinates.coords;

          // Reverse geocoding para obtener el nombre de la ciudad
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&accept-language=es`
          );
          const data = await response.json();

          const detectedCity =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.municipality;

          if (detectedCity) {
            setCity(detectedCity);
            localStorage.setItem('nlid_city', detectedCity);
          }
        }
      } catch (error) {
        console.log("No se pudo obtener la ubicación automática:", error);
      }
    };

    requestLocationAndSetCity();
  }, [setCity]);

  const { offers, loading, error, reload } = useOffers({ city });

  const featured = useMemo(
    () =>
      [...offers]
        .sort((a, b) => pct(b.original_price, b.rescue_price) - pct(a.original_price, a.rescue_price))
        .slice(0, 4),
    [offers]
  );
  const nearby = useMemo(
    () => [...offers].sort((a, b) => Number(a.distance_km || 99) - Number(b.distance_km || 99)).slice(0, 2),
    [offers]
  );
  const best = featured[0];
  const bestPct = offers.length ? Math.max(...offers.map((o) => pct(o.original_price, o.rescue_price))) : 0;
  const available = offers.reduce((sum, o) => sum + Number(o.quantity_available || 0), 0);
  const hasDemo = offers.some((o) => o.is_demo);

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header flotante */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
          No
          <br />
          lo dejes ir!
        </h1>

        <div className="flex min-w-0 shrink items-center gap-2">
          <Link
            to="/explorar"
            className="press flex h-10 min-w-0 items-center gap-1.5 rounded-full bg-slate-100/80 px-3 text-[12px] font-bold text-slate-800 ring-1 ring-border/50"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate">{city}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </Link>
          <Link
            to="/perfil/notificaciones"
            aria-label="Notificaciones"
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 ring-1 ring-border/70 shadow-xs"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="fade-up pt-5">
        <div className="relative overflow-hidden rounded-[28px] bg-white p-6 shadow-sm border border-slate-200/80">
          <img
            src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1000&q=80"
            alt="Alimentos frescos"
            className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none"
          />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/90 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-800 uppercase tracking-wider">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              RESCATE DE ALIMENTOS · {city}
            </div>

            <h2 className="mt-3.5 text-[42px] leading-[1.02] tracking-[-0.03em] text-slate-900 font-bold">
              <span className="font-savate font-semibold text-slate-900">
                comida RICA
              </span>
              <br />
              <span className="font-savate font-semibold italic text-amber-600 underline decoration-amber-400/60 decoration-wavy">
                precio de RESCATE
              </span>
            </h2>

            <p className="mt-3 max-w-[30ch] text-[15px] leading-relaxed text-slate-700 font-medium">
              Los excedentes del día en {city}, hasta un <strong className="text-emerald-700 font-Montserrat text-[18px]">50% más baratos</strong>. Reservás, pagás y retirás.
            </p>

            <button
              type="button"
              onClick={() => navigate('/explorar')}
              className="press mt-6 flex h-13 w-full items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-xs px-4 text-left border border-slate-200 shadow-xs hover:bg-white transition"
            >
              <Search className="h-[18px] w-[18px] shrink-0 text-emerald-600" />
              <span className="flex-1 truncate text-[14px] font-Montserrat text-slate-400">
                Buscar panaderías, viandas, ofertas…
              </span>
              <span className="flex h-8 items-center rounded-xl bg-emerald-600 px-3.5 text-[12px] font-Montserrat text-white shadow-xs">
                Buscar
              </span>
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas */}
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-gradient-to-br from-amber-500 to-amber-600 p-4 text-white shadow-sm">
            <p className="flex items-center gap-1.5 font-heading text-[22px] font-black leading-none">
              <Sparkles className="h-4.5 w-4.5 text-amber-100" />
              {bestPct}% OFF
            </p>
            <p className="mt-1.5 text-[11.5px] font-Montserrat text-amber-100">Ahorro máximo hoy</p>
          </div>

          <div className="rounded-[22px] bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-sm">
            <p className="flex items-center gap-1.5 font-heading text-[22px] font-black leading-none">
              <Sprout className="h-4.5 w-4.5 text-emerald-200" />
              {available}
            </p>
            <p className="mt-1.5 text-[11.5px] font-Montserrat text-emerald-100">Paquetes disponibles</p>
          </div>
        </div>
      </section>

      {/* Categorías */}
      <section className="mt-7">
        <SectionHeading title="Categorías" to="/explorar" toLabel="Todas" />
        <CategoryRail />
      </section>

      {/* Ofertas */}
      {loading ? (
        <div className="mt-7 space-y-4">
          <div className="shimmer h-[380px] rounded-[32px]" />
          <OfferCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={Leaf}
          title={`Todavía no hay ofertas en ${city}`}
          description="Estamos sumando comercios. Probá con otra ciudad o volvé más tarde."
          action={{ label: 'Explorar todas', to: '/explorar' }}
        />
      ) : (
        <>
          <section className="mt-7">
            <SectionHeading title="Oportunidad del día" subtitle="El mayor descuento disponible" />
            <HeroOffer offer={best} />
          </section>

          <section className="mt-8">
            <SectionHeading title="Destacados de hoy" subtitle="Elegidos por mejor descuento" to="/explorar" />
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
              {featured.map((offer) => (
                <OfferCard key={offer.id} offer={offer} variant="tile" />
              ))}
            </div>
          </section>

          <section className="mt-7">
            <SectionHeading title="Cerca tuyo" subtitle="Los retiros más próximos" />
            <div className="grid gap-3.5">
              {nearby.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionHeading title="Últimas oportunidades" subtitle="Retiro hoy, stock limited" to="/explorar" />
            <div className="grid gap-3.5">
              {offers.slice(1, 4).map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Card de Impacto Social/Ambiental */}
      <section className="relative mt-9 overflow-hidden rounded-[28px] bg-emerald-700 p-6 text-white shadow-md">
        <Leaf className="absolute -right-4 -top-2 h-28 w-28 rotate-12 text-white/10" strokeWidth={1} />
        <p className="eyebrow text-amber-300">Impacto real</p>
        <p className="mt-2 max-w-[22ch] font-display text-[23px] leading-[1.15]">
          Cada paquete rescatado evita que comida en buen estado se tire.
        </p>
        <p className="mt-2.5 max-w-[38ch] text-[12.5px] leading-relaxed text-emerald-100">
          Los comercios publican sus excedentes del día con horario de retiro y condiciones de
          conservación. El contenido de las cajas sorpresa varía según lo que quede disponible.
        </p>
        <Link
          to="/ayuda"
          className="press mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[12.5px] font-bold text-emerald-800 shadow-sm"
        >
          Cómo funciona
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {hasDemo && (
        <p className="mt-6 mb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Las ofertas marcadas «demo» son contenido de ejemplo para probar la app.
        </p>
      )}
    </div>
  );
}