import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';

import BrandMark from '../components/BrandMark';
import AdminStats from '../components/admin/AdminStats';
import AdminBusinesses from '../components/admin/AdminBusinesses';
import AdminOffers from '../components/admin/AdminOffers';
import AdminOrders from '../components/admin/AdminOrders';
import AdminCatalog from '../components/admin/AdminCatalog';
import AdminUsers from '../components/admin/AdminUsers';
import AdminSupport from '../components/admin/AdminSupport';
import AdminSettings from '../components/admin/AdminSettings';
import AdminDocs from '../components/admin/AdminDocs';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'comercios', label: 'Comercios' },
  { key: 'ofertas', label: 'Publicaciones' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'catalogo', label: 'Categorías y zonas' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'soporte', label: 'Soporte' },
  { key: 'config', label: 'Configuración' },
  { key: 'docs', label: 'Arquitectura y API' },
];

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useSession();
  const [tab, setTab] = useState('resumen');

  // Ajustá '/login' a la ruta de tu pantalla de acceso
  const goToLogin = () => navigate('/login', { state: { from: '/admin' } });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/admin', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm rounded-[26px] border border-border bg-card p-6 text-center">
          <BrandMark size={44} className="mx-auto" />
          <h1 className="mt-4 font-display text-2xl text-foreground">Panel de administración</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Acceso privado para el equipo de NO LO DEJES IR.
          </p>
          <button
            type="button"
            onClick={goToLogin}
            className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm rounded-[26px] border border-border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 font-display text-xl text-foreground">Acceso restringido</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Tu cuenta no tiene permisos de administración. Escribinos si necesitás acceso al panel.
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-5 w-full rounded-full border border-border py-2.5 text-xs font-semibold text-muted-foreground"
          >
            Cambiar de cuenta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sage/60">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <div>
              <p className="font-heading text-[12px] font-extrabold uppercase leading-none tracking-[0.16em] text-primary">
                No lo dejes ir
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Panel de administración
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[11px] font-semibold text-foreground">{user.full_name || user.email}</p>
              <p className="text-[10px] text-muted-foreground">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Salir
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 no-scrollbar">
          {TABS.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                tab === item.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {tab === 'resumen' && <AdminStats />}
        {tab === 'comercios' && <AdminBusinesses user={user} />}
        {tab === 'ofertas' && <AdminOffers user={user} />}
        {tab === 'pedidos' && <AdminOrders user={user} />}
        {tab === 'catalogo' && <AdminCatalog user={user} />}
        {tab === 'usuarios' && <AdminUsers user={user} />}
        {tab === 'soporte' && <AdminSupport user={user} />}
        {tab === 'config' && <AdminSettings user={user} />}
        {tab === 'docs' && <AdminDocs />}
      </main>
    </div>
  );
}