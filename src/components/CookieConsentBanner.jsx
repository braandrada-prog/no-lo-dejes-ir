import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { useCookieConsent } from '../hooks/useCookieConsent';
import { CONSENT_CATEGORIES } from '../lib/cookieConsent';

/**
 * Banner de consentimiento (no bloqueante). Se muestra hasta que el usuario decide y
 * cuando reabre las preferencias desde el Footer. "Rechazar" tiene el mismo peso visual
 * que "Aceptar", como exigen las buenas prácticas de consentimiento.
 */
export default function CookieConsentBanner() {
  const { consent, hasDecided, preferencesOpen, acceptAll, rejectNonEssential, save, closePreferences } =
    useCookieConsent();
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState(null);

  if (hasDecided && !preferencesOpen) return null;

  const showDetails = customizing || preferencesOpen;
  const current = draft ?? {
    analytics: consent?.categories?.analytics === true,
    marketing: consent?.categories?.marketing === true,
  };

  const finish = (action) => {
    action();
    setCustomizing(false);
    setDraft(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[540px] rounded-3xl bg-card p-4 shadow-2xl ring-1 ring-border/70"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="cookie-consent-title" className="text-[13.5px] font-bold text-foreground">
            Tu privacidad
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Usamos almacenamiento necesario para que la app funcione. Las cookies de analítica y marketing solo se
            activan si las aceptás. Más información en la{' '}
            <Link to="/legal/privacidad" className="font-semibold text-foreground underline underline-offset-2">
              Política de privacidad
            </Link>
            .
          </p>
        </div>
        {hasDecided && (
          <button type="button" onClick={closePreferences} aria-label="Cerrar" className="shrink-0">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {showDetails && (
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Categorías de cookies</legend>
          {Object.entries(CONSENT_CATEGORIES).map(([key, category]) => (
            <label key={key} className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                checked={category.required ? true : current[key]}
                disabled={category.required}
                onChange={(event) => setDraft({ ...current, [key]: event.target.checked })}
              />
              <span>
                <span className="block text-[12.5px] font-semibold text-foreground">
                  {category.label}
                  {category.required && <span className="ml-1 font-normal text-muted-foreground">(siempre activas)</span>}
                </span>
                <span className="block text-[11.5px] leading-relaxed text-muted-foreground">{category.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => finish(rejectNonEssential)}
          className="press h-10 flex-1 rounded-full border border-border bg-background px-4 text-[12.5px] font-semibold text-foreground"
        >
          Rechazar no esenciales
        </button>
        <button
          type="button"
          onClick={() => finish(acceptAll)}
          className="press h-10 flex-1 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground"
        >
          Aceptar todas
        </button>
        {showDetails ? (
          <button
            type="button"
            onClick={() => finish(() => save(current))}
            className="press h-10 w-full rounded-full px-4 text-[12.5px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Guardar mi selección
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="press h-10 w-full rounded-full px-4 text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            Configurar
          </button>
        )}
      </div>
    </div>
  );
}
