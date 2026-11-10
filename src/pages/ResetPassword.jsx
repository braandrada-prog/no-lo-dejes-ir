import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';
import BrandMark from '../components/BrandMark';

export default function ResetPassword() {
  const navigate = useNavigate();
  // Al abrir el enlace del correo, Supabase crea una sesión temporal de recuperación.
  const { user, loading } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || 'No pudimos cambiar la contraseña.');
      return;
    }

    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 1500);
  };

  if (loading) {
    return (
      <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 flex items-center justify-center px-5">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600/20 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      
      {/* Header Fijo unificado */}
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
          Nueva contraseña
        </h1>
      </header>

      <div className="mx-auto mt-6 max-w-sm">
        <div className="text-center">
          <BrandMark size={48} className="mx-auto" />
          <h2 className="mt-3 font-heading text-[22px] font-bold text-slate-900">Actualizar clave</h2>
        </div>

        {!user ? (
          <div className="mt-6 rounded-[28px] bg-white p-6 text-center border border-slate-200/80 shadow-xs">
            <p className="text-[13px] leading-relaxed text-slate-600">
              El enlace no es válido o ya venció. Pedí uno nuevo desde la pantalla de ingreso.
            </p>
            <Link 
              to="/forgot-password" 
              className="press mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : done ? (
          <div className="mt-6 rounded-[28px] bg-white p-6 text-center text-[13.5px] font-bold text-emerald-700 border border-slate-200/80 shadow-xs">
            Contraseña actualizada. Te llevamos al inicio…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3.5 rounded-[28px] bg-white p-6 border border-slate-200/80 shadow-xs">
            <label className="block text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
              Nueva contraseña
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  className="h-12 w-full rounded-2xl bg-slate-50 pl-10 pr-4 text-[14px] font-normal text-slate-800 border border-slate-200/80 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </label>

            <label className="block text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
              Repetí la contraseña
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Repetir contraseña"
                  className="h-12 w-full rounded-2xl bg-slate-50 pl-10 pr-4 text-[14px] font-normal text-slate-800 border border-slate-200/80 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </label>

            {error && <p className="text-[12px] font-medium leading-relaxed text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}