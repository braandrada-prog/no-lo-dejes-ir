import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { CITIES } from '../lib/categories';
import { distanceKm } from '../lib/geo';
import { isValidPoint } from '../lib/geocoding';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80';

function withDistance(offer) {
  if (offer.distance_km !== undefined && offer.distance_km !== null) return offer;
  const center = CITIES.find((c) => c.name?.toLowerCase() === offer.city?.toLowerCase());
  const km = distanceKm(center, offer);
  return km === null ? offer : { ...offer, distance_km: km };
}

/**
 * Ubicación real de los comercios de estas ofertas, leída de `businesses`.
 *
 * La vista public_offers devuelve COALESCE(b.lat, c.lat): si el comercio no tiene
 * coordenadas, pone el CENTRO DE LA CIUDAD (tabla cities). Eso sirve para estimar
 * distancias, pero no para dibujar un pin. Por eso se distingue:
 *   Map id → {lat,lng}  comercio con ubicación propia
 *   Map id → null       comercio sin ubicación (la vista usó el centro de la ciudad)
 * Devuelve null si la consulta falla (no se sabe: se usa la vista tal cual).
 */
async function fetchBusinessCoords(offers) {
  const ids = [...new Set(offers.map((o) => o.business_id).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('businesses').select('id, lat, lng').in('id', ids);
  if (error) {
    console.error('No se pudieron leer las ubicaciones de los comercios:', error);
    return null;
  }
  return new Map(
    (data ?? []).map((b) => [String(b.id), isValidPoint(b) ? { lat: Number(b.lat), lng: Number(b.lng) } : null])
  );
}

/** Aplica la ubicación real del comercio y marca si el pin es exacto. */
function locate(offer, coords) {
  if (!coords || !coords.has(String(offer.business_id))) return offer; // desconocido: se usa la vista
  const point = coords.get(String(offer.business_id));
  return point
    ? { ...offer, lat: point.lat, lng: point.lng, location_exact: true }
    : // Se conserva el centro de la ciudad solo para la distancia aproximada.
      { ...offer, location_exact: false };
}

export function useOffers({ city, category } = {}) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;

    async function fetchOffers() {
      setLoading(true);
      setError(false);

      let query = supabase
        .from('public_offers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (city) query = query.ilike('city', city);
      if (category) query = query.eq('category', category);

      const { data, error: queryError } = await query;
      if (!alive) return;

      if (queryError) {
        console.error('Error cargando ofertas:', queryError);
        setOffers([]);
        setError(true);
        setLoading(false);
        return;
      }

      const coords = await fetchBusinessCoords(data ?? []);
      if (!alive) return;

      setOffers(
        (data ?? []).map((offer) =>
          withDistance({ ...locate(offer, coords), image_url: offer.image_url || FALLBACK_IMG })
        )
      );
      setLoading(false);
    }

    fetchOffers();

    return () => {
      alive = false;
    };
  }, [city, category, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { offers, loading, error, reload };
}