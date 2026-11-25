import { Link } from 'react-router-dom';
import { company } from '../config/company';
import { openConsentPreferences } from '../lib/cookieConsent';
import ContactDetails from './ContactDetails';

/** Pie con contacto, datos legales y enlaces obligatorios (tiendas, pasarela de pagos, Ley 24.240). */
export default function Footer() {
  const linkClass = 'font-semibold text-foreground underline-offset-2 hover:underline';

  return (
    <footer className="mt-10 border-t border-border/70 pt-5 pb-2 text-center">
      <p className="font-heading text-[13px] font-bold text-foreground">{company.brandName}</p>
      <ContactDetails variant="compact" className="mt-2" />

      <nav aria-label="Enlaces legales" className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
        <Link to="/legal/terminos" className={linkClass}>
          Términos y condiciones
        </Link>
        <Link to="/legal/privacidad" className={linkClass}>
          Privacidad
        </Link>
        <Link to="/ayuda" className={linkClass}>
          Ayuda y soporte
        </Link>
        <button type="button" onClick={openConsentPreferences} className={linkClass}>
          Preferencias de cookies
        </button>
      </nav>

      <p className="mt-3 text-[10px] text-muted-foreground">
        © {new Date().getFullYear()} {company.legalName}. Todos los derechos reservados.
      </p>
    </footer>
  );
}
