import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';
import BrandMark from '../components/BrandMark';

const COPY = {
  login: { title: 'Ingresá a tu cuenta', subtitle: 'Reservá, pagá y retirá tus paquetes.', button: 'Ingresar' },
  register: { title: 'Creá tu cuenta', subtitle: 'Es gratis y lleva un minuto.', button: 'Crear cuenta' },
  forgot: {
    title: 'Recuperá tu contraseña',
    subtitle: 'Te enviamos un enlace para elegir una nueva.',
    button: 'Enviar enlace',
  },
};

const ERRORS = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo. Probá ingresar.',
};

const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary';

export default function Login({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useSession();
  const [mode, setMode] = useState(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Si venís de /admin o de una pantalla protegida, volvés ahí al ingresar.
  const from = location.state?.from || '/';

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [loading, user, from, navigate]);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  // Función para iniciar sesión o registrarse con Google adaptada a móvil (Capacitor)
  const handleGoogleLogin = async () => {
    try {
      setError('');
      // Si corre en la app nativa usa el esquema personalizado, sino el origin web
      const isNative = window.Capacitor?.isNativePlatform?.();
      const redirectUrl = isNative ? 'nolodejesir://callback' : window.location.origin;

      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (googleError) throw googleError;
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión con Google.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else if (mode === 'register') {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          switchMode('login');
          setNotice('Te enviamos un correo para confirmar tu cuenta. Después podés ingresar.');
        }
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (authError) throw authError;
        setNotice('Si el correo existe, te enviamos un enlace para cambiar la contraseña.');
      }
    } catch (err) {
      setError(ERRORS[err.message] || err.message || 'No pudimos completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <BrandMark size={48} className="mx-auto" />
          <h1 className="mt-4 font-display text-[28px] leading-tight text-foreground">{copy.title}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Botón de Google (disponible en modo login o register) */}
        {mode !== 'forgot' && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="press flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continuar con Google</span>
            </button>

            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <span className="relative bg-background px-3 text-xs text-muted-foreground uppercase font-medium">
                o con correo
              </span>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3 rounded-[26px] border border-border bg-card p-5">
          {mode === 'register' && (
            <label className="block text-[11px] font-medium text-muted-foreground">
              Nombre y apellido
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                className={inputClass}
              />
            </label>
          )}

          <label className="block text-[11px] font-medium text-muted-foreground">
            Correo electrónico
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className={inputClass}
            />
          </label>

          {mode !== 'forgot' && (
            <label className="block text-[11px] font-medium text-muted-foreground">
              Contraseña
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={inputClass}
              />
            </label>
          )}

          {error && <p className="text-[12px] leading-relaxed text-destructive">{error}</p>}
          {notice && <p className="text-[12px] leading-relaxed text-forest">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary press flex h-12 w-full items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.button}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="w-full text-center text-[12px] font-semibold text-muted-foreground"
            >
              Olvidé mi contraseña
            </button>
          )}
        </form>

        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          {mode === 'login' ? (
            <>
              ¿No tenés cuenta?{' '}
              <button type="button" onClick={() => switchMode('register')} className="font-bold text-primary">
                Registrate
              </button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{' '}
              <button type="button" onClick={() => switchMode('login')} className="font-bold text-primary">
                Ingresá
              </button>
            </>
          )}
        </p>

        <p className="mt-3 text-center">
          <Link to="/" className="text-[12px] font-semibold text-muted-foreground">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}