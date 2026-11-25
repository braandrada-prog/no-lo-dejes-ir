/**
 * Geocodificación de direcciones de comercios (Argentina).
 *
 * Fuentes, en orden:
 *  1. Georef AR (apis.datos.gob.ar, API oficial y gratuita): interpola la ALTURA sobre la
 *     cuadra con datos de calles del INDEC. Es la única que ubica bien "Alvear 379, Salto",
 *     donde OpenStreetMap no tiene numeración.
 *  2. Nominatim (OpenStreetMap), consulta ESTRUCTURADA (calle + ciudad + provincia + país).
 *     Solo se usa a pedido (botón), nunca para autocompletar: su política de uso lo prohíbe.
 *
 * Todas las funciones devuelven { lat, lng } (orden de Leaflet). Las APIs que responden
 * [lon, lat] o "lon" se convierten acá, en un solo lugar.
 */
import { CITIES } from './categories';
import { distanceKm } from './geo';
import { normalize } from './location';

const GEOREF_URL = 'https://apis.datos.gob.ar/georef/api/direcciones';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const DEFAULT_PROVINCE = 'Buenos Aires';

/** Distancia máxima razonable entre un comercio y el centro de su ciudad. */
export const MAX_KM_FROM_CITY = 15;

/** Precisión del resultado, de mejor a peor. */
export const PRECISION = { address: 3, street: 2, city: 1 };
export const PRECISION_LABEL = {
  address: 'Dirección exacta (calle y altura)',
  street: 'Solo la calle (sin altura): ajustá el pin',
  city: 'Solo la ciudad: ajustá el pin',
};

/** Centro de una ciudad de la lista (o null). */
export function cityCenter(city, cities = CITIES) {
  const found = cities.find((c) => normalize(c.name) === normalize(city));
  return found && Number(found.lat) && Number(found.lng) ? { lat: Number(found.lat), lng: Number(found.lng) } : null;
}

/** true si las coordenadas son válidas (no null, no 0,0, dentro de rango). */
export function isValidPoint(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/**
 * Diagnóstico de la ubicación guardada de un comercio respecto de su ciudad.
 * status: 'missing' | 'far' | 'ok' | 'unknown_city'
 */
export function checkBusinessLocation(business, cities = CITIES) {
  if (!isValidPoint(business)) return { status: 'missing' };
  const center = cityCenter(business.city, cities);
  if (!center) return { status: 'unknown_city' };
  const km = distanceKm(center, { lat: Number(business.lat), lng: Number(business.lng) });
  return km > MAX_KM_FROM_CITY ? { status: 'far', km } : { status: 'ok', km };
}

/** Separa "Av. Alvear 379" en { street: 'Av. Alvear', number: '379' }. */
export function splitStreetNumber(address) {
  const text = String(address || '').trim().replace(/\s+/g, ' ');
  const match = text.match(/^(.*?\D)\s*(?:n(?:°|º|ro\.?)?\s*)?(\d{1,5})(?:\s*[a-zA-Z])?\s*$/i);
  return match ? { street: match[1].replace(/[,\s]+$/, ''), number: match[2] } : { street: text, number: '' };
}

async function getJson(url, params, { signal, headers } = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${url}?${query.toString()}`, { signal, headers });
  if (!response.ok) throw new Error(`geocoding_http_${response.status}`);
  return response.json();
}

async function searchGeoref({ address, city, province, signal, max = 5 }) {
  const data = await getJson(
    GEOREF_URL,
    { direccion: address, localidad_censal: city, provincia: province, max: String(max) },
    { signal }
  );
  const seen = new Set();
  return (data?.direcciones || [])
    .filter((d) => d?.ubicacion?.lat != null && d?.ubicacion?.lon != null)
    .map((d) => ({
      label: d.nomenclatura,
      lat: Number(d.ubicacion.lat),
      lng: Number(d.ubicacion.lon), // Georef usa "lon"
      precision: d.altura?.valor ? 'address' : 'street',
      source: 'georef',
    }))
    .filter((c) => {
      // Georef puede devolver la misma altura en dos tramos de la calle: se deja el primero.
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
}

const NOMINATIM_ADDRESS_TYPES = new Set(['house', 'building', 'place', 'commercial', 'retail', 'shop', 'amenity']);
const NOMINATIM_STREET_TYPES = new Set([
  'road',
  'residential',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'living_street',
  'pedestrian',
  'service',
]);

let lastNominatimCall = 0;

async function searchNominatim({ address, city, province, signal }) {
  // Política de Nominatim: como máximo 1 request por segundo.
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimCall = Date.now();

  const { street, number } = splitStreetNumber(address);
  const data = await getJson(
    NOMINATIM_URL,
    {
      street: number ? `${number} ${street}` : street,
      city,
      state: province,
      country: 'Argentina',
      countrycodes: 'ar',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      'accept-language': 'es',
    },
    { signal }
  );

  const wantedCity = normalize(city);
  return (Array.isArray(data) ? data : [])
    .filter((r) => {
      const a = r.address || {};
      const place = normalize(a.city || a.town || a.village || a.municipality || '');
      const county = normalize(a.county || a.state_district || '').replace(/^partido de /, '');
      return !wantedCity || place === wantedCity || county === wantedCity;
    })
    .map((r) => {
      const type = r.addresstype || r.type;
      const precision =
        r.address?.house_number || NOMINATIM_ADDRESS_TYPES.has(type)
          ? 'address'
          : NOMINATIM_STREET_TYPES.has(type) || r.category === 'highway'
            ? 'street'
            : 'city';
      return {
        label: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon), // Nominatim usa "lon"
        precision,
        source: 'nominatim',
      };
    });
}

/** Ordena por precisión y descarta resultados lejos de la ciudad (homónimos en otra zona). */
function rank(candidates, city, cities) {
  const center = cityCenter(city, cities);
  return candidates
    .filter((c) => isValidPoint(c))
    .filter((c) => !center || distanceKm(center, c) <= MAX_KM_FROM_CITY)
    .sort((a, b) => PRECISION[b.precision] - PRECISION[a.precision]);
}

/**
 * Busca una dirección con contexto completo (calle y altura + ciudad + provincia + país).
 * - mode 'suggest': solo Georef (apto para autocompletar con debounce).
 * - mode 'search': Georef y, si no hay coincidencia exacta, Nominatim estructurado.
 * Devuelve candidatos ordenados (el primero es el mejor).
 */
export async function geocodeAddress({
  address,
  city,
  province = DEFAULT_PROVINCE,
  mode = 'search',
  signal,
  cities = CITIES,
}) {
  const text = String(address || '').trim();
  if (text.length < 3 || !city) return [];

  let candidates = [];
  try {
    candidates = await searchGeoref({ address: text, city, province, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('Georef no respondió:', err?.message);
  }

  const hasExact = candidates.some((c) => c.precision === 'address');
  if (mode === 'search' && !hasExact) {
    try {
      candidates = candidates.concat(await searchNominatim({ address: text, city, province, signal }));
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      console.warn('Nominatim no respondió:', err?.message);
    }
  }

  return rank(candidates, city, cities);
}
