import { useEffect, useState } from 'react';

import { supabase } from '../../services/supabaseClient';
import { dateLabel } from '../../lib/format';

const ROLE_LABELS = {
  user: 'Consumidor',
  owner: 'Comercio',
  admin: 'Administrador',
};

export default function AdminUsers({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, city, role, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!alive) return;
      if (loadError) {
        console.error('Error cargando usuarios:', loadError);
        setError('No pudimos cargar los usuarios con tu nivel de permisos.');
      } else {
        setUsers(data ?? []);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div>
      <p className="text-sm font-semibold text-foreground">Usuarios ({users.length})</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Los administradores acceden a este panel y a todos los datos. Por seguridad, el rol no se puede
        cambiar desde el panel: los administradores se asignan desde el SQL Editor de Supabase. El rol
        «Comercio» se asigna solo cuando un usuario da de alta su comercio.
      </p>
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Usuario</th>
              <th className="px-3 py-2.5">Ciudad</th>
              <th className="px-3 py-2.5">Alta</th>
              <th className="px-3 py-2.5">Rol</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id} className="border-t border-border/70">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">
                    {item.full_name || 'Sin nombre'}
                    {item.id === user?.id && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(vos)</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.email}</p>
                  {item.phone && <p className="text-[10px] text-muted-foreground">{item.phone}</p>}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{item.city || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{dateLabel(item.created_at)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.role === 'admin'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {ROLE_LABELS[item.role] || item.role}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Todavía no hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}