import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';

export default function SignInCard({ title, message }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Después de ingresar, Login.jsx te devuelve a la pantalla de donde venías.
  const goToLogin = () =>
    navigate('/login', { state: { from: `${location.pathname}${location.search}` } });

  return (
    <div className="surface-card fade-up mx-auto mt-8 max-w-sm px-6 py-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-sage text-forest">
        <LogIn className="h-6 w-6" strokeWidth={1.8} />
      </div>
      <h2 className="mt-4 font-display text-[22px] leading-snug text-foreground">
        {title || 'Ingresá para continuar'}
      </h2>
      <p className="mx-auto mt-2 max-w-[32ch] text-[13px] leading-relaxed text-muted-foreground">
        {message || 'Necesitás una cuenta para comprar, guardar favoritos y ver tus reservas.'}
      </p>
      <button type="button" onClick={goToLogin} className="btn-primary press mt-6 h-[52px] w-full">
        Ingresar o crear cuenta
      </button>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver
      </button>
    </div>
  );
}
