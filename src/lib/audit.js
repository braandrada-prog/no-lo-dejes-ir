import { supabase } from '../services/supabaseClient';
 
// Registra una acción del panel de administración. Nunca lanza error:
// si falla el registro, solo lo deja en la consola para no cortar el flujo.
export async function logAction(user, action, target = '', details = '') {
  const { error } = await supabase.from('audit_logs').insert({
    actor_id: user?.id ?? null,
    actor_email: user?.email ?? '',
    action,
    target,
    details,
  });
 
  if (error) console.error('No se pudo registrar la acción de auditoría:', error);
}