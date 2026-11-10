import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import PageHeader from '../components/PageHeader';
import { useSession } from '../hooks/useSession';

const FAQ = [
  {
    q: '¿Qué es una caja sorpresa?',
    a: 'Es un paquete de alimentos excedentes del día. El contenido varía según lo que el comercio tenga disponible al momento del cierre, por eso el precio es mucho menor.',
  },
  {
    q: '¿Los alimentos están en buen estado?',
    a: 'Sí. Los comercios solo pueden publicar excedentes aptos para consumo. Cada oferta indica condiciones de conservación y alérgenos cuando corresponde.',
  },
  {
    q: '¿Cómo retiro mi pedido?',
    a: 'Con el código QR de la reserva, en la dirección y el horario indicados. El código es de un solo uso y se valida al entregarte el paquete.',
  },
  {
    q: '¿Puedo cancelar una compra?',
    a: 'Podés solicitar la cancelación desde el detalle del pedido. Si el retiro todavía no ocurrió, el equipo evalúa el reembolso según los términos de compra.',
  },
  {
    q: '¿Necesito dar mi ubicación?',
    a: 'No. Podés elegir tu ciudad manualmente. La ubicación es opcional y solo se usa para ordenar las ofertas por distancia.',
  },
];

export default function Help() {
  const { user } = useSession();
  const [open, setOpen] = useState(0);
  const [form, setForm] = useState({ subject: '', category: 'reserva', order_number: '', message: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!user) {
      setError('Ingresá a tu cuenta para enviarnos la consulta y poder responderte.');
      return;
    }
    if (form.message.trim().length < 10) {
      setError('Contanos un poco más para poder ayudarte.');
      return;
    }

    setBusy(true);
    const { error: insertError } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || '',
      category: form.category,
      subject: form.subject || 'Consulta desde la app',
      message: form.message,
      order_number: form.order_number,
    });
    setBusy(false);

    if (insertError) {
      console.error('Error enviando la consulta:', insertError);
      setError('No pudimos enviar tu consulta. Probá de nuevo en un momento.');
      return;
    }

    setSent(true);
    setForm({ subject: '', category: 'reserva', order_number: '', message: '' });
  };

  return (
    <div>
      <PageHeader title="Ayuda y soporte" subtitle="Preguntas frecuentes y contacto" back="/perfil" />

      <section className="overflow-hidden rounded-[26px] bg-card ring-1 ring-border/60" style={{ boxShadow: 'var(--shadow-soft)' }}>
        {FAQ.map((item, index) => (
          <div key={item.q} className="border-b border-border/70 last:border-0">
            <button
              type="button"
              onClick={() => setOpen(open === index ? -1 : index)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-[13.5px] font-semibold text-foreground">{item.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open === index ? 'rotate-180' : ''}`}
              />
            </button>
            {open === index && (
              <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-muted-foreground">{item.a}</p>
            )}
          </div>
        ))}
      </section>

      <section className="mt-3 rounded-[26px] bg-card p-4 ring-1 ring-border/60">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Escribinos</h2>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          Respondemos por correo al email de tu cuenta. Incluí el número de pedido si tu consulta es
          sobre una reserva.
        </p>

        {sent ? (
          <div className="mt-4 rounded-2xl bg-secondary p-4 text-center text-xs font-medium text-secondary-foreground">
            Recibimos tu mensaje. Te vamos a responder a {user?.email}.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <label className="block text-[11px] font-medium text-muted-foreground">
              Motivo
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
              >
                <option value="reserva">Consulta sobre una reserva</option>
                <option value="reembolso">Reembolso</option>
                <option value="cancelacion">Cancelación</option>
                <option value="producto">Problema con un producto</option>
                <option value="cuenta">Mi cuenta</option>
                <option value="privacidad">Datos personales</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Asunto
              <input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Resumen de tu consulta"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Número de pedido (opcional)
              <input
                value={form.order_number}
                onChange={(event) => setForm({ ...form, order_number: event.target.value })}
                placeholder="NLID-20261104-1234"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Mensaje
              <textarea
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                rows={4}
                placeholder="Contanos qué pasó"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
              />
            </label>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary press h-[52px] w-full">
              {busy ? 'Enviando…' : 'Enviar consulta'}
            </button>
          </form>
        )}
      </section>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
        Defensa del consumidor: ante un reclamo sin respuesta podés acudir al organismo provincial de
        aplicación de la Ley 24.240.
      </p>
    </div>
  );
}