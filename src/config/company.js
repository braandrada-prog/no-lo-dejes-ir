/**
 * Datos legales y de contacto de la empresa (fuente única para Footer, Ayuda y páginas legales).
 *
 * Cómo completarlos: definí las variables VITE_* en tu `.env` local y en Vercel
 * (Settings → Environment Variables). Mientras falten, se muestran los PLACEHOLDERS de
 * abajo, marcados como pendientes, y en desarrollo se avisa por consola.
 *
 * Son datos públicos: se incrustan en el bundle del navegador. No pongas secretos acá.
 */

const PLACEHOLDERS = {
  brandName: 'NO LO DEJES IR',
  legalName: '[Razón social pendiente]',
  taxId: '[CUIT pendiente]',
  address: '[Domicilio legal pendiente]',
  supportEmail: 'soporte@ejemplo.com',
  supportPhone: '+54 9 11 0000-0000',
  supportHours: 'Lunes a viernes de 9 a 18 h',
};

const env = import.meta.env;
const read = (name) => String(env[name] ?? '').trim();

export const company = {
  brandName: read('VITE_BRAND_NAME') || PLACEHOLDERS.brandName,
  legalName: read('VITE_LEGAL_NAME') || PLACEHOLDERS.legalName,
  taxId: read('VITE_LEGAL_TAX_ID') || PLACEHOLDERS.taxId,
  address: read('VITE_LEGAL_ADDRESS') || PLACEHOLDERS.address,
  supportEmail: read('VITE_SUPPORT_EMAIL') || PLACEHOLDERS.supportEmail,
  supportPhone: read('VITE_SUPPORT_PHONE') || PLACEHOLDERS.supportPhone,
  supportHours: read('VITE_SUPPORT_HOURS') || PLACEHOLDERS.supportHours,
};

/** Campos que todavía muestran el placeholder (útil para avisos y checklists). */
export const missingCompanyFields = Object.keys(PLACEHOLDERS).filter(
  (key) => key !== 'brandName' && key !== 'supportHours' && company[key] === PLACEHOLDERS[key]
);

/** true si el campo sigue con el valor de ejemplo. */
export const isPlaceholder = (key) => missingCompanyFields.includes(key);

/** href para el teléfono: solo dígitos y el "+" inicial. */
export const phoneHref = (phone = company.supportPhone) => `tel:${phone.replace(/(?!^\+)[^\d]/g, '')}`;

export const mailHref = (email = company.supportEmail, subject = '') =>
  `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

if (env.DEV && missingCompanyFields.length) {
  console.warn(
    `[company] Faltan datos legales/de contacto: ${missingCompanyFields.join(', ')}. ` +
      'Completá las variables VITE_* (ver .env.example).'
  );
}
