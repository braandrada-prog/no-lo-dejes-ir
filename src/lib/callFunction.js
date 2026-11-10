import { supabase } from '../services/supabaseClient';
 
// Invoca una Edge Function de Supabase y devuelve `data`.
// Si falla, lanza un Error con `detail` (el JSON de error que devolvió la función, si lo hay).
export async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
 
  if (error) {
    let detail = {};
    try {
      detail = await error.context.json();
    } catch {
      // sin detalle disponible (error de red, función inexistente, etc.)
    }
    const err = new Error(detail.error || detail.message || error.message);
    err.detail = detail;
    throw err;
  }
 
  return data;
}