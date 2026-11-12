import { cn } from '../lib/utils';

export default function BrandMark({ size = 36, variant = 'solid', className }) {
  // Cambiamos el color base a verde esmeralda (#059669 o similar de tu paleta)
  const tone = variant === 'solid' ? '#059669' : '#ffffff';
  const leaf = variant === 'solid' ? '#ffffff' : '#059669';
  const spark = '#fbbf24'; // Un toque ámbar/dorado para el círculo

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="14" fill={tone} />
      <path
        d="M34.5 12.5c-12.2.6-19.4 5.6-19.4 13.4 0 4.7 3.4 8.1 8 8.1 7.6 0 11.4-8.4 11.4-21.5Z"
        fill={leaf}
      />
      <path
        d="M13 37c1.6-7.9 5.6-14.2 12-19"
        stroke={leaf}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="33.5" cy="33.5" r="4" fill={spark} />
    </svg>
  );
}