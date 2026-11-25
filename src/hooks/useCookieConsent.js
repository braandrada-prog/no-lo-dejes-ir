import { useSyncExternalStore } from 'react';
import {
  acceptAllConsent,
  closeConsentPreferences,
  getConsentSnapshot,
  openConsentPreferences,
  rejectNonEssentialConsent,
  saveConsent,
  subscribeConsent,
} from '../lib/cookieConsent';

/**
 * Estado del consentimiento de cookies, reactivo y sincronizado entre pestañas.
 *
 *   const { allows } = useCookieConsent();
 *   if (allows('analytics')) { ... }
 */
export function useCookieConsent() {
  const { consent, preferencesOpen } = useSyncExternalStore(subscribeConsent, getConsentSnapshot);

  return {
    consent,
    hasDecided: Boolean(consent),
    preferencesOpen,
    allows: (category) => category === 'necessary' || consent?.categories?.[category] === true,
    acceptAll: acceptAllConsent,
    rejectNonEssential: rejectNonEssentialConsent,
    save: saveConsent,
    openPreferences: openConsentPreferences,
    closePreferences: closeConsentPreferences,
  };
}
