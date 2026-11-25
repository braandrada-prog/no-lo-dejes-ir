import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ContactDetails from '../components/ContactDetails';
import { company } from '../config/company';

const TERMS = [
  {
    h: '1. Objeto del servicio',
    p: 'NO LO DEJES IR conecta consumidores con comercios que ofrecen alimentos excedentes aptos para consumo a un precio reducido. La plataforma no elabora ni manipula los alimentos: la venta la realiza cada comercio y el retiro es presencial en el establecimiento.',
  },
  {
    h: '2. Cajas sorpresa y contenido variable',
    p: 'Muchas publicaciones son cajas sorpresa: su contenido se arma con los excedentes disponibles del día y puede variar respecto de las fotografías ilustrativas. El comercio informa categoría, condiciones de conservación y alérgenos cuando corresponde.',
  },
  {
    h: '3. Precios y pagos',
    p: 'El precio de rescate y el precio original de referencia se muestran antes de confirmar la compra. El cobro se procesa a través de Mercado Pago. La reserva solo queda confirmada cuando el proveedor de pagos informa la aprobación al servidor de la plataforma.',
  },
  {
    h: '4. Reserva, retiro y vencimiento',
    p: 'Al iniciar el pago se bloquean las unidades por un plazo limitado. Si el pago no se confirma en ese plazo, la reserva se cancela y las unidades se liberan. El retiro se realiza únicamente en el horario publicado, presentando el código QR de la reserva, que es de un solo uso.',
  },
  {
    h: '5. Cancelaciones y reembolsos',
    p: 'Podés solicitar la cancelación desde el detalle de tu pedido. Los reembolsos se evalúan según el estado del retiro y se procesan por el mismo medio de pago, conforme a la Ley 24.240 de Defensa del Consumidor y a la normativa de comercio electrónico aplicable.',
  },
  {
    h: '6. Responsabilidad sobre los alimentos',
    p: 'Cada comercio es responsable de la aptitud, rotulado, conservación y trazabilidad de los alimentos que publica. La plataforma no admite publicaciones de alimentos vencidos o no aptos para consumo y puede suspender publicaciones y comercios.',
  },
  {
    h: '7. Cuenta de usuario',
    p: 'Sos responsable de la veracidad de tus datos y del uso de tu cuenta. Podés solicitar la baja y la eliminación de tus datos personales en cualquier momento.',
  },
  {
    h: '8. Titular del servicio y contacto',
    p: `El servicio es prestado por ${company.legalName} (CUIT ${company.taxId}), con domicilio legal en ${company.address}. Para consultas, reclamos o desconocimiento de un cargo, escribinos a ${company.supportEmail} o llamanos al ${company.supportPhone} (${company.supportHours}). Te recomendamos contactarnos antes de iniciar un contracargo: resolvemos los reclamos por el mismo medio de pago.`,
  },
];

const PRIVACY = [
  {
    h: '1. Responsable del tratamiento',
    p: `El responsable de la base de datos es ${company.legalName} (CUIT ${company.taxId}), con domicilio en ${company.address}. Los datos personales que brindás se utilizan para gestionar tu cuenta, procesar reservas y pagos, emitir comprobantes y brindarte soporte. El tratamiento se rige por la Ley 25.326 de Protección de Datos Personales de la República Argentina.`,
  },
  {
    h: '2. Datos que recopilamos',
    p: 'Nombre y apellido, correo electrónico, teléfono, ciudad y dirección favorita (opcional), historial de compras y datos técnicos necesarios para operar el servicio. No almacenamos los datos completos de tu tarjeta: son procesados por Mercado Pago.',
  },
  {
    h: '3. Finalidad y base legal',
    p: 'Usamos los datos para ejecutar la compra y el retiro, cumplir obligaciones legales y, solo con tu consentimiento, enviarte comunicaciones comerciales. Podés retirar ese consentimiento desde tu perfil en cualquier momento.',
  },
  {
    h: '4. Ubicación',
    p: 'La ubicación es opcional. Si la autorizás, se usa únicamente para ordenar las ofertas por distancia. Podés usar la app sin conceder ese permiso eligiendo tu ciudad manualmente.',
  },
  {
    h: '5. Conservación y seguridad',
    p: 'Conservamos los datos mientras tu cuenta esté activa y durante los plazos legales aplicables. Aplicamos control de acceso por roles, validación de datos en el servidor y registro de auditoría de las acciones sensibles.',
  },
  {
    h: '6. Tus derechos',
    p: `Podés solicitar acceso, rectificación, actualización o supresión de tus datos escribiendo a ${company.supportEmail}, desde «Ayuda y soporte» o desde «Eliminar mi cuenta» en tu perfil. La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326.`,
  },
  {
    h: '7. Cookies y almacenamiento local',
    p: 'Usamos almacenamiento necesario para mantener tu sesión, recordar tu ciudad y guardar tus preferencias. Las cookies de analítica o marketing solo se activan si las aceptás en el aviso de cookies, y podés cambiar tu decisión en cualquier momento desde «Preferencias de cookies» al pie de la app.',
  },
];

export default function Legal() {
  const { doc } = useParams();
  const isPrivacy = doc === 'privacidad';
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <div>
      <PageHeader
        title={isPrivacy ? 'Política de privacidad' : 'Términos y condiciones'}
        subtitle="Última actualización: noviembre de 2026"
        back="/perfil"
      />
      <div className="space-y-5 pb-6">
        {sections.map((section) => (
          <section key={section.h}>
            <h2 className="font-heading text-[14px] font-bold text-foreground">{section.h}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{section.p}</p>
          </section>
        ))}
        <section className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
          <h2 className="font-heading text-[14px] font-bold text-foreground">Contacto</h2>
          <ContactDetails className="mt-3" subject={isPrivacy ? 'Datos personales' : 'Consulta sobre términos'} />
        </section>
        <p className="rounded-2xl bg-secondary/60 p-3 text-[10px] leading-relaxed text-secondary-foreground">
          Este documento describe el funcionamiento del servicio. Para consultas específicas sobre tu
          compra, escribinos desde «Ayuda y soporte».
        </p>
      </div>
    </div>
  );
}