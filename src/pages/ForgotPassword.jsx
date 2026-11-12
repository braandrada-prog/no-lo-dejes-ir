import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="-mx-5 -mt-5 min-h-screen bg-gradient-to-b from-emerald-100/70 via-amber-100/40 to-slate-100 px-5 pt-5 pb-10">
      <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between gap-2 border-b border-border/40 bg-white/90 px-5 py-2.5 backdrop-blur-xl shadow-xs">
        <h1 className="shrink-0 font-heading font-savate text-[22px] font-semibold leading-[1.05] tracking-tight text-primary">
          Recuperar clave
        </h1>
        <Link to="/login" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </header>

      <div className="mt-8 rounded-[28px] bg-white p-6 border border-slate-200/80 shadow-xs max-w-md mx-auto">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4">
          <KeyRound className="h-6 w-6" />
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <h2 className="font-heading text-[18px] font-bold text-slate-900">¡Email enviado!</h2>
            <p className="text-[13px] text-slate-600">
              Revisá tu casilla de correo (<strong>{email}</strong>) para hacer clic en el enlace de recuperación.
            </p>
            <Link to="/login" className="press mt-4 inline-flex h-11 items-center justify-center w-full rounded-2xl bg-emerald-600 text-[13px] font-bold text-white">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-[13px] text-slate-600">
              Ingresá el correo asociado a tu cuenta y te enviaremos las instrucciones para restablecer tu contraseña.
            </p>
            
            <label className="block text-[11.5px] font-bold text-slate-600 uppercase tracking-wider">
              Correo electrónico
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="h-12 w-full rounded-2xl bg-slate-50 pl-10 pr-4 text-[14px] font-normal text-slate-800 border border-slate-200/80 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </label>

            {error && <p className="text-[12px] font-medium text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="press h-12 w-full rounded-2xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              {loading ? 'Enviando…' : 'Enviar instrucciones'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}