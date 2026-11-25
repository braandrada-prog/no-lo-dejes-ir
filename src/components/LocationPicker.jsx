import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { AlertTriangle, Crosshair, Loader2, MapPin, Search } from 'lucide-react';

import { useCities } from '../hooks/useCities';
import { distanceKm } from '../lib/geo';
import { getCurrentCoords } from '../lib/location';
import {
  MAX_KM_FROM_CITY,
  PRECISION_LABEL,
  cityCenter,
  geocodeAddress,
  isValidPoint,
} from '../lib/geocoding';

const FALLBACK_CENTER = { lat: -34.2886, lng: -60.2514 }; // Salto
const SUGGEST_DEBOUNCE_MS = 500;

// Ícono propio (divIcon): evita el problema de las imágenes del marcador por defecto de
// Leaflet con Vite y se ve igual en web y en la app Android.
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17 45s15-15.2 15-27A15 15 0 0 0 2 18c0 11.8 15 27 15 27z" fill="#7539d0" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="17" r="5.5" fill="#fff"/></svg>`,
  iconSize: [34, 46],
  iconAnchor: [17, 45],
});

// Mueve la vista cuando cambia el punto (MapContainer solo usa `center` al montarse).
// Depende de los números (no del objeto) para no recentrar en cada render.
function FlyTo({ lat, lng, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), zoom), { animate: true });
  }, [map, lat, lng, zoom]);
  return null;
}

function ClickToPlace({ onPlace }) {
  useMapEvents({ click: (event) => onPlace({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

const round = (n) => Math.round(Number(n) * 1e7) / 1e7;

/**
 * Dirección + mapa con pin arrastrable para fijar la ubicación exacta de un comercio.
 *
 * - Al escribir (debounce) se buscan sugerencias reales con Georef AR; si la primera es
 *   una dirección exacta, el pin se mueve solo.
 * - "Ubicar en el mapa" busca también en OpenStreetMap si Georef no encontró la altura.
 * - El pin se puede arrastrar o se puede tocar el mapa: eso actualiza lat/lng SIN tocar el
 *   texto de la dirección.
 *
 * Props: address, onAddressChange(text), city, value {lat,lng}|null, onChange({lat,lng,source})
 */
export default function LocationPicker({
  address,
  onAddressChange,
  city,
  value,
  onChange,
  inputClassName = 'mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm',
  label = 'Dirección comercial',
  required = true,
}) {
  const cities = useCities();
  const point = isValidPoint(value) ? { lat: Number(value.lat), lng: Number(value.lng) } : null;
  const center = cityCenter(city, cities);

  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // { type, text }
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const requestRef = useRef(null);

  const place = (next, source, precision) => {
    onChange({ lat: round(next.lat), lng: round(next.lng), source });
    if (source === 'manual') {
      setStatus({ type: 'ok', text: 'Ubicación ajustada a mano. Se guarda exactamente donde dejaste el pin.' });
    } else if (precision) {
      setStatus({
        type: precision === 'address' ? 'ok' : 'warn',
        text: PRECISION_LABEL[precision],
      });
    }
  };

  const runSearch = async (mode) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (mode === 'search') setSearching(true);
    try {
      const results = await geocodeAddress({ address, city, mode, signal: controller.signal, cities });
      if (controller.signal.aborted) return results;
      setSuggestions(results);
      return results;
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setStatus({ type: 'warn', text: 'No pudimos consultar el mapa. Ubicá el pin a mano.' });
      }
      return [];
    } finally {
      if (mode === 'search' && requestRef.current === controller) setSearching(false);
    }
  };

  // Autocompletado con debounce (solo cuando el usuario escribe y hay una altura).
  useEffect(() => {
    if (!userEdited || !city || !/\d/.test(address || '') || String(address).trim().length < 4) return undefined;
    const timer = setTimeout(async () => {
      const results = await runSearch('suggest');
      setOpen(results.length > 0);
      const best = results[0];
      // Pin automático solo con coincidencia exacta de calle y altura.
      if (best?.precision === 'address') place(best, 'geocoded', best.precision);
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a lo que escribe el usuario
  }, [address, city, userEdited]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const locateOnMap = async () => {
    if (!city) {
      setStatus({ type: 'warn', text: 'Elegí primero la localidad.' });
      return;
    }
    const results = await runSearch('search');
    const best = results[0];
    if (best) {
      place(best, 'geocoded', best.precision);
      setOpen(results.length > 1);
    } else if (center) {
      onChange({ ...center, source: 'city' });
      setStatus({
        type: 'warn',
        text: `No encontramos "${address}" en ${city}. Dejamos el pin en el centro: arrastralo hasta tu local.`,
      });
    }
  };

  const useDeviceLocation = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentCoords();
      place(coords, 'manual');
    } catch {
      setStatus({ type: 'warn', text: 'No pudimos obtener tu ubicación. Revisá el permiso o ubicá el pin a mano.' });
    } finally {
      setLocating(false);
    }
  };

  const farKm = point && center ? distanceKm(center, point) : null;
  const isFar = farKm !== null && farKm > MAX_KM_FROM_CITY;

  const markerHandlers = useMemo(
    () => ({
      dragend: (event) => {
        const { lat, lng } = event.target.getLatLng();
        place({ lat, lng }, 'manual');
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `place` solo usa setters y onChange
    [onChange]
  );

  const mapCenter = point || center || FALLBACK_CENTER;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        <div className="relative">
          <input
            type="text"
            required={required}
            placeholder="Ej. Alvear 379"
            value={address || ''}
            autoComplete="off"
            onChange={(event) => {
              setUserEdited(true);
              onAddressChange(event.target.value);
            }}
            onFocus={() => setOpen(suggestions.length > 0)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            role="combobox"
            aria-expanded={open}
            aria-controls="address-suggestions"
            aria-autocomplete="list"
            className={inputClassName}
          />
          {open && suggestions.length > 0 && (
            <ul
              id="address-suggestions"
              role="listbox"
              className="absolute z-[1000] mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg"
            >
              {suggestions.map((s) => (
                <li key={`${s.source}-${s.lat}-${s.lng}`} role="option" aria-selected="false">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      place(s, 'geocoded', s.precision);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    <span>
                      <span className="block text-gray-900">{s.label}</span>
                      <span className="block text-xs text-gray-500">{PRECISION_LABEL[s.precision]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={locateOnMap}
          disabled={searching || !address}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? 'Buscando…' : 'Ubicar en el mapa'}
        </button>
        <button
          type="button"
          onClick={useDeviceLocation}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title="Usalo solo si estás dentro del local"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          Estoy en el local
        </button>
      </div>

      <div className="h-64 w-full overflow-hidden rounded-md ring-1 ring-gray-200">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={point ? 17 : 14}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyTo lat={(point || center)?.lat} lng={(point || center)?.lng} zoom={point ? 17 : 14} />
          <ClickToPlace onPlace={(next) => place(next, 'manual')} />
          {point && (
            <Marker position={[point.lat, point.lng]} icon={pinIcon} draggable eventHandlers={markerHandlers} />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-gray-500">
        Arrastrá el pin o tocá el mapa para marcar la puerta exacta del local.
        {point && ` (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`}
      </p>

      {isFar && (
        <p className="flex items-start gap-1.5 rounded bg-red-50 p-2 text-xs text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          El pin está a {farKm} km del centro de {city}. Revisá la ubicación antes de guardar.
        </p>
      )}
      {!isFar && status && (
        <p
          className={`rounded p-2 text-xs ${status.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}
          role="status"
        >
          {status.text}
        </p>
      )}
      {!point && !status && (
        <p className="text-xs text-amber-700">Todavía no hay ubicación: tocá “Ubicar en el mapa”.</p>
      )}
    </div>
  );
}
