import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { redeemOrderByCode } from '../_shared/pickup.ts';
 
/**
 * Validación de retiro desde el panel de administración (sin control de horario:
 * el equipo puede resolver excepciones). El panel del comercio usa `merchantRedeem`
 * con el mismo núcleo compartido.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
 
    // SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
 
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
 
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
 
    if (profile?.role !== 'admin') {
      return json(
        { error: 'Sólo el equipo de la plataforma puede validar retiros desde este panel.' },
        403
      );
    }
 
    const body = await req.json().catch(() => ({}));
    const result = await redeemOrderByCode(supabaseAdmin, {
      code: body.code,
      actorEmail: user.email,
      actorRole: profile.role,
      channel: 'admin_panel',
    });
 
    return json(result.body, result.status);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});