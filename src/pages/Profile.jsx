import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Camera,
  ChevronRight,
  HelpCircle,
  LogOut,
  MapPin,
  Package,
  PiggyBank,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import SignInCard from '../components/SignInCard';
import { Switch } from '../components/ui/switch';
import { ars } from '../lib/format';
import { useSession } from '../hooks/useSession';

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile, loading: sessionLoading } = useSession();

  const [form, setForm] = useState({ full_name: '', phone: '', city: '', address: '' });
  const [prefs, setPrefs] = useState({ notify_orders: true, notify_promos: false, marketing_consent: false });
  const [stats, setStats] = useState({ orders: 0, saved: 0, stores: 0 });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;

    setForm({
      full_name: profile?.full_name || user.full_name || '',
      phone: profile?.phone || '',
      city: profile?.city || localStorage.getItem('nlid_city') || '',
      address: profile?.address || '',
    });

    setPrefs({
      notify_orders: profile?.notify_orders !== false,
      notify_promos: Boolean(profile?.notify_promos),
      marketing_consent: Boolean(profile?.marketing_consent),
    });

    setAvatarUrl(profile?.avatar_url || '');

    // Estadísticas: pedidos del usuario (la tabla orders guarda user_email)
    async function loadStats() {
      const { data: items, error: statsError } = await supabase
        .from('orders')
        .select('status, savings, business_name')
        .eq('user_email', user.email);

      if (!alive) return;
      if (statsError) {
        console.error('Error al cargar estadísticas:', statsError);
        return;
      }
      const completed = (items ?? []).filter((o) => ['paid', 'picked_up'].includes(o.status));
      setStats({
        orders: completed.length,
        saved: completed.reduce((sum, o) => sum + (Number(o.savings) || 0), 0),
        stores: new Set(completed.map((o) => o.business_name).filter(Boolean)).size,
      });
    }

    loadStats();
    return () => {
      alive = false;
    };
  }, [user, profile]);

  const save = async () => {
    setSaving(true);
    setError('');

    const { data, error: saveError } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        phone: form.phone,
        city: form.city,
        address: form.address,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('*');

    setSaving(false);

    if (saveError) {
      console.error('Error al guardar datos:', saveError);
      setError(`No se pudo guardar: ${saveError.message}`);
      return;
    }
    if (!data?.length) {
      setError('No se guardó nada: tu usuario no tiene fila en la tabla profiles (o no tiene permiso de edición). Corré el SQL de perfiles.');
      return;
    }

    const row = data[0];
    setForm({
      full_name: row.full_name || '',
      phone: row.phone || '',
      city: row.city || '',
      address: row.address || '',
    });

    setSavedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setSavedAt(''), 2500);
  };

  const savePref = async (key, checked) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: checked });
    setError('');

    const { data, error: prefError } = await supabase
      .from('profiles')
      .update({ [key]: checked, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id');

    if (prefError || !data?.length) {
      console.error('Error al guardar la preferencia:', prefError);
      setPrefs(previous);
      setError(
        prefError
          ? `No se pudo guardar: ${prefError.message}`
          : 'No se guardó: tu usuario no tiene fila en la tabla profiles (o no tiene permiso de edición).'
      );
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError('');
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const fileUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: fileUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setAvatarUrl(fileUrl);
    } catch (err) {
      console.error('Error subiendo avatar:', err);
      setError(`No pudimos subir la foto: ${err.message || 'error desconocido'}`);
    } finally {
      setUploading(false);
    }
  };

  const requestDeletion = async () => {
    setError('');
    const { error: ticketError } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      user_email: user.email,
      user_name: form.full_name || '',
      category: 'privacidad',
      subject: 'Solicitud de eliminación de cuenta y datos personales',
      message:
        'Solicito la eliminación de mi cuenta y de los datos personales asociados, conforme a la Ley 25.326 de Protección de Datos Personales.',
    });

    if (ticketError) {
      console.error('Error enviando ticket de eliminación:', ticketError);
      setError('No pudimos registrar tu solicitud. Escribinos desde Ayuda y soporte.');
      return;
    }
    setDeleteRequested(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Cargando sesión
  if (sessionLoading) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Mi perfil
          </h1>
        </header>
        <div className="mt-5 space-y-3">
          <div className="shimmer h-32 rounded-[28px]" />
          <div className="shimmer h-24 rounded-[24px]" />
          <div className="shimmer h-64 rounded-[26px]" />
        </div>
      </div>
    );
  }

  // Sin usuario
  if (!user) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Perfil
          </h1>
        </header>
        <div className="mt-5">
          <SignInCard title="Entrá a tu cuenta" message="Creá tu cuenta para reservar, ahorrar y ver tu impacto." />
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header Fijo */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <div>
          <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
            Mi perfil
          </h1>
          <p className="truncate text-[11.5px] font-medium text-slate-500">
            {user.email}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50">
          <User className="h-4 w-4" />
        </div>
      </header>

      {/* Tarjeta Hero del Perfil */}
      <div className="relative mt-5 overflow-hidden rounded-[28px] bg-emerald-700 px-5 py-5 text-white shadow-md">
        <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-white/10 pointer-events-none" />
        
        <div className="relative flex items-center gap-3.5">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={form.full_name || 'Perfil'}
                className="h-[68px] w-[68px] rounded-full object-cover ring-2 ring-white/30 shadow-xs"
              />
            ) : (
              <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white/15 font-heading text-[26px] font-extrabold text-white ring-2 ring-white/20">
                {(form.full_name || user.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <label className="press absolute -bottom-0.5 -right-0.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-emerald-800 shadow-sm">
              <Camera className="h-4 w-4" />
              <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[21px] font-bold leading-tight">
              {form.full_name || 'Completá tu nombre'}
            </p>
            <p className="mt-1 truncate text-[11.5px] font-Montserrat text-emerald-100">
              {uploading ? 'Subiendo foto…' : user.email}
            </p>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-center">
          <div>
            <p className="font-heading text-[18px] font-bold leading-none">{stats.orders}</p>
            <p className="mt-1 text-[15px] font-Montserrat text-emerald-100">Compras</p>
          </div>
          <div>
            <p className="font-heading text-[18px] font-bold leading-none">{ars(stats.saved)}</p>
            <p className="mt-1 text-[15px] font-Montserrat text-amber-300">Ahorro</p>
          </div>
          <div>
            <p className="font-heading text-[18px] font-bold leading-none">{stats.stores}</p>
            <p className="mt-1 text-[15px] font-Montserrat text-emerald-100">Comercios</p>
          </div>
        </div>
      </div>

      {/* Formulario de Datos Personales */}
      <section className="mt-4 rounded-[28px] bg-white p-5 border border-slate-200/80 shadow-xs">
        <h2 className="font-heading text-[16px] font-bold text-slate-900">Datos personales</h2>
        <div className="mt-3.5 space-y-3">
          {[
            { key: 'full_name', label: 'Nombre y apellido', placeholder: 'Ej. Ana Gómez' },
            { key: 'phone', label: 'Teléfono', placeholder: 'Ej. 2477 456789' },
            { key: 'city', label: 'Ciudad', placeholder: 'Salto o Pergamino' },
            { key: 'address', label: 'Dirección favorita (opcional)', placeholder: 'Calle y número' },
          ].map((field) => (
            <label key={field.key} className="block text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
              {field.label}
              <input
                value={form[field.key]}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                placeholder={field.placeholder}
                className="mt-1.5 h-12 w-full rounded-2xl bg-slate-50 px-4 text-[14px] font-normal text-slate-800 border border-slate-200/80 outline-none transition focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </label>
          ))}
        </div>

        {/* Preferencias */}
        <div className="mt-5 space-y-3.5 border-t border-slate-100 pt-4">
          {[
            { key: 'notify_orders', label: 'Avisos de compras y retiros' },
            { key: 'notify_promos', label: 'Ofertas de mis favoritos' },
            { key: 'marketing_consent', label: 'Comunicaciones comerciales' },
          ].map((pref) => (
            <div key={pref.key} className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-slate-700">{pref.label}</span>
              <Switch
                checked={prefs[pref.key]}
                onCheckedChange={(checked) => savePref(pref.key, checked)}
              />
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-[12px] leading-relaxed text-rose-600 font-medium">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="press mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-xs hover:bg-emerald-700 transition"
        >
          {saving ? 'Guardando…' : savedAt ? `Guardado ${savedAt}` : 'Guardar cambios'}
        </button>
      </section>

      {/* Menú de Opciones */}
      <section className="mt-4 overflow-hidden rounded-[28px] bg-white border border-slate-200/80 shadow-xs divide-y divide-slate-100">
        {[
          { to: '/perfil/notificaciones', label: 'Notificaciones', icon: Bell },
          { to: '/compras', label: 'Mis compras y reservas', icon: Package },
          { to: '/ayuda', label: 'Ayuda y soporte', icon: HelpCircle },
          { to: '/legal/terminos', label: 'Términos y condiciones', icon: Shield },
          { to: '/legal/privacidad', label: 'Política de privacidad', icon: Shield },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="press flex items-center gap-3.5 px-4.5 py-4 hover:bg-slate-50/50 transition"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
            </span>
            <span className="flex-1 text-[13.5px] font-bold text-slate-800">{label}</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        ))}
      </section>

      {/* Acciones de Cuenta */}
      <div className="mt-4 space-y-2.5">
        <button
          type="button"
          onClick={handleLogout}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[13px] font-bold text-slate-700 border border-slate-200/80 shadow-xs hover:bg-slate-50 transition"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>

        {deleteRequested ? (
          <p className="rounded-2xl bg-emerald-50 p-4 text-center text-[11.5px] leading-relaxed font-medium text-emerald-800 border border-emerald-200/50">
            Recibimos tu solicitud de eliminación. El equipo la procesa y te confirma por correo.
          </p>
        ) : (
          <button
            type="button"
            onClick={requestDeletion}
            className="press flex h-11 w-full items-center justify-center gap-2 text-[12px] font-bold text-rose-600 hover:text-rose-700 transition"
          >
            <Trash2 className="h-4 w-4" /> Eliminar mi cuenta y mis datos
          </button>
        )}
      </div>

      {/* Footer Branding */}
      <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
        <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
        Rescatá local, ahorrá todos los días.
      </div>

    </div>
  );
}