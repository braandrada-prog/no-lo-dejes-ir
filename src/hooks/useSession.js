import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useSession() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadUser(session) {
      const authUser = session?.user;
      if (!authUser) {
        if (alive) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data: row } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!alive) return;

      const nextProfile = row ?? null;
      const nextUser = {
        id: authUser.id,
        email: authUser.email,
        full_name: row?.full_name ?? authUser.user_metadata?.full_name ?? '',
        role: row?.role ?? 'user',
      };

      // Supabase vuelve a emitir eventos al volver a la pestaña: si no cambió nada,
      // se conserva el mismo objeto para no recargar pantallas ni borrar formularios a medias.
      setProfile((prev) => (same(prev, nextProfile) ? prev : nextProfile));
      setUser((prev) => (same(prev, nextUser) ? prev : nextUser));
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => loadUser(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // setTimeout evita bloqueos al hacer consultas dentro de este callback
      setTimeout(() => loadUser(session), 0);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading, isAdmin: user?.role === 'admin' };
}