export const ars = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export const pct = (original, rescue) => {
  const o = Number(original) || 0;
  const r = Number(rescue) || 0;
  if (o <= 0 || r <= 0 || r >= o) return 0;
  return Math.round((1 - r / o) * 100);
};

export const saving = (original, rescue) => Math.max((Number(original) || 0) - (Number(rescue) || 0), 0);

// Una fecha sola ("2026-11-07", como la devuelve una columna `date` de Supabase) se
// interpreta en hora local. Con new Date("2026-11-07") se tomaría como medianoche UTC
// y en Argentina se mostraría el día anterior.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = DATE_ONLY.exec(String(value));
  const d = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Acepta "18:00", "18:00:00" (columna `time` de Supabase) o una fecha-hora completa.
const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?$/;

const time = (value) => {
  if (!value) return '';
  const text = String(value);
  if (TIME_ONLY.test(text)) return text.slice(0, 5).padStart(5, '0');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

export const pickupWindow = (start, end) => {
  const a = time(start);
  const b = time(end);
  if (!a && !b) return 'Consultar horario';
  return `${a} a ${b}`;
};

export const dayLabel = (value) => {
  const d = parseDate(value);
  if (!d) return '';
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (same) return 'Hoy';
  if (d.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
};

export const dateLabel = (value) => {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

export const distanceLabel = (km) => {
  if (km === null || km === undefined || km === '') return '';
  const n = Number(km);
  if (Number.isNaN(n)) return '';
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1).replace('.', ',')} km`;
};

export const orderStatus = {
  pending_payment: { label: 'Pendiente de pago', tone: 'amber' },
  paid: { label: 'Pago confirmado', tone: 'green' },
  ready: { label: 'Listo para retirar', tone: 'green' },
  picked_up: { label: 'Retirado', tone: 'slate' },
  no_show: { label: 'No retirado', tone: 'slate' },
  cancelled: { label: 'Cancelado', tone: 'slate' },
  refunded: { label: 'Reembolsado', tone: 'blue' },
  expired: { label: 'Vencido', tone: 'slate' },
};

export const statusClasses = {
  green: 'bg-secondary text-secondary-foreground',
  amber: 'bg-accent/12 text-clay',
  blue: 'bg-blue-500/10 text-blue-700',
  slate: 'bg-muted text-muted-foreground',
  red: 'bg-destructive/10 text-destructive',
};