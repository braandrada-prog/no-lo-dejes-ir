import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, LocateFixed, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import OfferCard from '../components/OfferCard';
import OfferCardSkeleton from '../components/feedback/OfferCardSkeleton';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import MapView from '../components/MapView';
import CategoryRail from '../components/CategoryRail';
import { useOffers } from '../hooks/useOffers';
import { useCity } from '../hooks/useCity';
import { useCities } from '../hooks/useCities';
import { distanceKm } from '../lib/geo';
import { pct } from '../lib/format';
import { cn } from '../lib/utils';

const SORTS = [
  { value: 'distancia', label: 'Más cercanos' },
  { value: 'descuento', label: 'Mayor descuento' },
  { value: 'precio', label: 'Menor precio' },
  { value: 'recientes', label: 'Recién publicados' },
  { value: 'agotandose', label: 'Próximos a agotarse' },
];

const selectClass =
  'h-10 shrink-0 rounded-full bg-secondary px-3.5 text-[12.5px] font-semibold text-secondary-foreground ring-1 ring-secondary outline-none';

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [city, setCity] = useCity();
  const [text, setText] = useState('');
  const [sort, setSort] = useState('distancia');
  const [view, setView] = useState('list');
  const [openFilters, setOpenFilters] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');
  const [minDiscount, setMinDiscount] = useState('');
  const [maxDistance, setMaxDistance] = useState('');
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState('');
  const cities = useCities();

  const category = params.get('categoria') || '';
  const { offers, loading, error, reload } = useOffers({ city, category });

  useEffect(() => {
    if (params.get('ciudad') && params.get('ciudad') !== city) {
      setCity(params.get('ciudad'));
    }
  }, [params, city, setCity]);

  const center = cities.find((c) => c.name === city) || cities[0];

  const list = useMemo(() => {
    const base = coords || center;
    let items = offers.map((offer) => ({
      ...offer,
      distance_km: distanceKm(base, offer) ?? offer.distance_km,
    }));

    const q = text.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (o) =>
          o.title?.toLowerCase().includes(q) ||
          o.business_name?.toLowerCase().includes(q) ||
          o.category?.toLowerCase().includes(q)
      );
    }
    if (maxPrice) items = items.filter((o) => Number(o.rescue_price) <= Number(maxPrice));
    if (minDiscount)
      items = items.filter((o) => pct(o.original_price, o.rescue_price) >= Number(minDiscount));
    if (maxDistance)
      items = items.filter((o) => Number(o.distance_km || 0) <= Number(maxDistance));

    const sorters = {
      distancia: (a, b) => (a.distance_km || 99) - (b.distance_km || 99),
      descuento: (a, b) =>
        pct(b.original_price, b.rescue_price) - pct(a.original_price, a.rescue_price),
      precio: (a, b) => Number(a.rescue_price) - Number(b.rescue_price),
      recientes: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      agotandose: (a, b) => Number(a.quantity_available) - Number(b.quantity_available),
    };
    return [...items].sort(sorters[sort] || sorters.distancia);
  }, [offers, text, sort, maxPrice, minDiscount, maxDistance, coords, center]);

  const locate = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no permite geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort('distancia');
      },
      () => setGeoError('No pudimos obtener tu ubicación. Podés elegir la ciudad manualmente.')
    );
  };

  const activeFilters = [maxPrice, minDiscount, maxDistance].filter(Boolean).length;

  const clearFilters = () => {
    setMaxPrice('');
    setMinDiscount('');
    setMaxDistance('');
  };

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header Fijo con Blur idéntico al de Favoritos */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <div className="min-w-0">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Explorar
          </h1>
          <p className="text-[11.5px] font-medium text-slate-500">
            {loading ? 'Buscando ofertas…' : `${list.length} ofertas en ${city}`}
          </p>
        </div>
        <div className="flex shrink-0 rounded-full bg-secondary p-1 ring-1 ring-secondary">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="Ver como lista"
            className={cn(
              'press flex h-9 w-10 items-center justify-center rounded-full transition',
              view === 'list' ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground'
            )}
          >
            <List className="h-[17px] w-[17px]" />
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-label="Ver en el mapa"
            className={cn(
              'press flex h-9 w-10 items-center justify-center rounded-full transition',
              view === 'map' ? 'bg-primary text-primary-foreground' : 'text-secondary-foreground'
            )}
          >
            <MapIcon className="h-[17px] w-[17px]" />
          </button>
        </div>
      </header>

      {/* Controles de búsqueda y filtros */}
      <div className="mt-4 flex gap-2">
        <div className="flex h-[52px] flex-1 items-center gap-2.5 rounded-full bg-card px-4 ring-1 ring-border/70">
          <Search className="h-[18px] w-[18px] shrink-0 text-primary" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar oferta o comercio"
            className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {text && (
            <button type="button" onClick={() => setText('')} aria-label="Borrar búsqueda">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpenFilters((v) => !v)}
          aria-label="Filtros"
          className={cn(
            'press relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ring-1 transition',
            openFilters || activeFilters
              ? 'bg-primary text-primary-foreground ring-primary'
              : 'bg-secondary text-secondary-foreground ring-secondary'
          )}
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
          {activeFilters > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground ring-2 ring-background">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        <select
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            setCoords(null);
            setGeoError('');
            setParams({ categoria: category, ciudad: event.target.value });
          }}
          className={selectClass}
        >
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={locate}
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[12.5px] font-semibold text-secondary-foreground ring-1 ring-secondary"
        >
          <LocateFixed className="h-3.5 w-3.5 text-primary" /> Mi ubicación
        </button>
      </div>

      {geoError && <p className="mt-2 text-[11.5px] leading-relaxed text-destructive">{geoError}</p>}

      {openFilters && (
        <div className="fade-up mt-3 rounded-[24px] bg-secondary/40 p-4 ring-1 ring-secondary">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11.5px] font-semibold text-muted-foreground">
              Precio máximo
              <input
                type="number"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Ej. 5000"
                className="mt-1 h-11 w-full rounded-xl bg-background px-3 text-[14px] text-foreground ring-1 ring-border outline-none focus:ring-primary/40"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-muted-foreground">
              Descuento mínimo %
              <input
                type="number"
                value={minDiscount}
                onChange={(event) => setMinDiscount(event.target.value)}
                placeholder="Ej. 40"
                className="mt-1 h-11 w-full rounded-xl bg-background px-3 text-[14px] text-foreground ring-1 ring-border outline-none focus:ring-primary/40"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-muted-foreground">
              Distancia máxima (km)
              <input
                type="number"
                value={maxDistance}
                onChange={(event) => setMaxDistance(event.target.value)}
                placeholder="Ej. 5"
                className="mt-1 h-11 w-full rounded-xl bg-background px-3 text-[14px] text-foreground ring-1 ring-border outline-none focus:ring-primary/40"
              />
            </label>
            <button type="button" onClick={clearFilters} className="btn-soft press mt-6 h-11 ring-1 ring-secondary">
              Limpiar filtros
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <CategoryRail active={category} compact />
      </div>

      {/* Tarjeta contenedora principal con fondo blanco puro y bordes redondeados */}
      <div className="mt-4 rounded-[26px] bg-white border border-border p-5 shadow-xs">
        {view === 'map' ? (
          <div>
            <MapView offers={list} center={center} userPoint={coords} />
            <p className="mt-2 text-center text-[11.5px] leading-relaxed text-muted-foreground">
              Tocá un punto para ver la oferta. Podés abrir la navegación desde el detalle.
            </p>
          </div>
        ) : loading ? (
          <div className="grid gap-3.5">
            {[0, 1, 2].map((i) => (
              <OfferCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No encontramos ofertas"
            description="Probá cambiar la ciudad, la categoría o quitar los filtros."
            action={
              activeFilters
                ? { label: 'Quitar filtros', onClick: clearFilters }
                : { label: 'Ver todo', to: '/explorar' }
            }
          />
        ) : (
          <div className="grid gap-3.5">
            {list.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}