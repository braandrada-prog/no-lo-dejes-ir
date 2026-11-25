/**
 * Consentimiento de cookies / almacenamiento no esencial.
 *
 * - "necessary" siempre está activo (sesión de Supabase, ciudad elegida, este mismo registro).
 * - "analytics" y "marketing" arrancan en false y solo se activan con consentimiento explícito.
 * - Se guarda en localStorage con versión: si cambian las categorías, subí CONSENT_VERSION
 *   y se vuelve a preguntar.
 *
 * Para cualquier integración futura (Analytics, píxeles, etc.) usá `whenConsented` o el hook
 * `useCookieConsent`: nunca cargues el script directamente.
 */

export const CONSENT_VERSION = 1;
const STORAGE_KEY = 'nlid_cookie_consent';

export const CONSENT_CATEGORIES = {
  necessary: {
    label: 'Necesarias',
    description: 'Sesión, seguridad, ciudad elegida y tus preferencias. Sin ellas la app no funciona.',
    required: true,
  },
  analytics: {
    label: 'Analítica',
    description: 'Estadísticas de uso anónimas para mejorar la app.',
  },
  marketing: {
    label: 'Marketing',
    description: 'Medición de campañas y anuncios personalizados.',
  },
};

const listeners = new Set();
let cached; // undefined = no leído todavía; null = sin decisión
let preferencesOpen = false;
let snapshot = { consent: null, preferencesOpen: false };

function readStored() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== CONSENT_VERSION || typeof parsed.categories !== 'object') return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: parsed.decidedAt || null,
      categories: {
        necessary: true,
        analytics: parsed.categories.analytics === true,
        marketing: parsed.categories.marketing === true,
      },
    };
  } catch {
    return null;
  }
}

function refreshSnapshot() {
  if (cached === undefined) cached = readStored();
  snapshot = { consent: cached, preferencesOpen };
}

function emit() {
  refreshSnapshot();
  listeners.forEach((listener) => listener());
}

export function getConsentSnapshot() {
  if (cached === undefined) refreshSnapshot();
  return snapshot;
}

export function subscribeConsent(listener) {
  listeners.add(listener);
  // Sincroniza entre pestañas.
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      cached = readStored();
      emit();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Guarda la decisión. `categories` puede omitir claves: lo no indicado queda en false. */
export function saveConsent(categories = {}) {
  const next = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    categories: {
      necessary: true,
      analytics: categories.analytics === true,
      marketing: categories.marketing === true,
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento (modo privado estricto): la decisión vale solo para esta sesión.
  }
  cached = next;
  preferencesOpen = false;
  emit();
}

export const acceptAllConsent = () => saveConsent({ analytics: true, marketing: true });
export const rejectNonEssentialConsent = () => saveConsent({});

export function openConsentPreferences() {
  preferencesOpen = true;
  emit();
}

export function closeConsentPreferences() {
  preferencesOpen = false;
  emit();
}

/** true si la categoría tiene consentimiento vigente. "necessary" siempre es true. */
export function hasConsent(category) {
  if (category === 'necessary') return true;
  return getConsentSnapshot().consent?.categories?.[category] === true;
}

/**
 * Ejecuta `init` recién cuando la categoría tenga consentimiento (de inmediato si ya lo tiene).
 * Se ejecuta una sola vez. Devuelve una función para cancelar la espera.
 *
 *   whenConsented('analytics', () => loadScript('https://…/analytics.js'));
 */
export function whenConsented(category, init) {
  let done = false;
  const run = () => {
    if (done || !hasConsent(category)) return;
    done = true;
    unsubscribe();
    init();
  };
  const unsubscribe = subscribeConsent(run);
  run();
  return () => {
    done = true;
    unsubscribe();
  };
}

/** Inserta un <script> externo una sola vez. Usalo siempre dentro de whenConsented. */
export function loadScript(src, attrs = {}) {
  if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  Object.entries(attrs).forEach(([key, value]) => script.setAttribute(key, value));
  document.head.appendChild(script);
}
