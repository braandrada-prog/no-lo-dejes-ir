// Fechas y horas en hora argentina (UTC-3 fijo, sin horario de verano).
export const TZ = 'America/Argentina/Buenos_Aires';

// "2026-11-11" de hoy en Argentina
export const todayAR = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

// ("2026-11-11", "18:00") -> ISO en UTC, listo para una columna timestamptz
export const toArgISO = (date, time) => new Date(`${date}T${time}:00-03:00`).toISOString();

// ISO -> { date: "2026-11-11", time: "18:00" } en hora argentina (para inputs date/time)
export const isoToArgParts = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: TZ }),
    time: d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: TZ,
    }),
  };
};
