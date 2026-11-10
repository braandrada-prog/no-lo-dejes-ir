import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { CITIES } from '../lib/categories';
import { distanceKm } from '../lib/geo';

// Calcula la distancia (km) entre el centro de la ciudad y el comercio de la oferta.
// Si la oferta ya trae distance_km, se respeta.
function withDistance(offer) {
  if (offer.distance_km !== undefined && offer.distance_km !== null) return offer;
  const center = CITIES.find((c) => c.name === offer.city);
  const km = distanceKm(center, offer);
  return km === null ? offer : { ...offer, distance_km: km };
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
        .from('offers')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100);

      if (city) query = query.eq('city', city);
      if (category) query = query.eq('category', category);

      const { data, error: queryError } = await query;
      if (!alive) return;

      if (queryError) {
        console.error('Error cargando ofertas:', queryError);
        setOffers([]);
        setError(true);
      } else {
        setOffers((data ?? []).map(withDistance));
      }
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