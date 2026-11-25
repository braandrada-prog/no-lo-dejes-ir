import { Building2, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { company, isPlaceholder, mailHref, phoneHref } from '../config/company';
import { cn } from '../lib/utils';

// En desarrollo resalta los datos que todavía tienen el valor de ejemplo.
function Value({ field, children }) {
  const pending = import.meta.env.DEV && isPlaceholder(field);
  return (
    <span
      className={cn(pending && 'rounded bg-amber-100 px-1 text-amber-800')}
      title={pending ? 'Dato pendiente: completalo en las variables VITE_*' : undefined}
    >
      {children}
    </span>
  );
}

/**
 * Bloque de contacto legal y de soporte. Lee todo de src/config/company.js.
 *  - variant="full": soporte + datos legales (Ayuda, páginas legales).
 *  - variant="compact": una línea por dato, para el Footer.
 */
export default function ContactDetails({ variant = 'full', subject = '', className = '' }) {
  const rows = [
    { field: 'supportEmail', icon: Mail, label: 'Email', value: company.supportEmail, href: mailHref(company.supportEmail, subject) },
    { field: 'supportPhone', icon: Phone, label: 'Teléfono / WhatsApp', value: company.supportPhone, href: phoneHref() },
    { field: 'supportHours', icon: Clock, label: 'Horario de atención', value: company.supportHours },
  ];
  const legal = [
    { field: 'legalName', icon: Building2, label: 'Razón social', value: `${company.legalName} · CUIT ${company.taxId}` },
    { field: 'address', icon: MapPin, label: 'Domicilio legal', value: company.address },
  ];

  if (variant === 'compact') {
    return (
      <address className={cn('not-italic space-y-1 text-[11px] leading-relaxed text-muted-foreground', className)}>
        <p>
          <a href={mailHref(company.supportEmail, subject)} className="font-semibold text-foreground underline-offset-2 hover:underline">
            <Value field="supportEmail">{company.supportEmail}</Value>
          </a>
          {' · '}
          <a href={phoneHref()} className="underline-offset-2 hover:underline">
            <Value field="supportPhone">{company.supportPhone}</Value>
          </a>
        </p>
        <p>
          <Value field="legalName">{company.legalName}</Value> · CUIT <Value field="taxId">{company.taxId}</Value>
        </p>
        <p>
          <Value field="address">{company.address}</Value>
        </p>
      </address>
    );
  }

  return (
    <address className={cn('not-italic space-y-2.5', className)}>
      {[...rows, ...legal].map(({ field, icon: Icon, label, value, href }) => (
        <div key={field} className="flex items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {href ? (
              <a href={href} className="break-words text-[13px] font-semibold text-foreground underline-offset-2 hover:underline">
                <Value field={field}>{value}</Value>
              </a>
            ) : (
              <p className="break-words text-[13px] text-foreground">
                {field === 'legalName' ? (
                  <>
                    <Value field="legalName">{company.legalName}</Value> · CUIT{' '}
                    <Value field="taxId">{company.taxId}</Value>
                  </>
                ) : (
                  <Value field={field}>{value}</Value>
                )}
              </p>
            )}
          </div>
        </div>
      ))}
    </address>
  );
}
