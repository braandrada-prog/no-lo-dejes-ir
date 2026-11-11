import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { CITIES } from '../lib/categories';

// Muestra la lista fija al instante y la reemplaza por la de Supabase cuando llega.
export function useCities() {
  const [cities, setCities] = useState(CITIES);

  useEffect(() => {
    let alive = true;

    supabase
      .from('cities')
      .select('name, lat, lng')
      .order('name')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) console.error('Error cargando ciudades:', error);
        else if (data?.length) setCities(data);
      });

    return () => {
      alive = false;
    };
  }, []);

  return cities;
}