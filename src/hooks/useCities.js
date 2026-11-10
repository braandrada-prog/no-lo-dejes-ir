import { CITIES } from '../lib/categories';

// Lista fija de ciudades. Si más adelante querés administrarlas desde Supabase,
// se reemplaza por una consulta a una tabla `cities` sin tocar a quien lo usa.
export function useCities() {
  return CITIES;
}