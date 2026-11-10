import { useState } from 'react';
import { ArrowRight, Check, Leaf, MapPin } from 'lucide-react';

import BrandMark from './BrandMark';
import { useCities } from '../hooks/useCities';
import { cn } from '../lib/utils';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80';

export default function Onboarding({ city, onDone }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(city);
  const cities = useCities();

  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background px-6 pb-10 pt-12">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
          <div className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <p className="font-heading text-[12px] font-extrabold uppercase tracking-[0.16em] text-primary">
              No lo dejes ir
            </p>
          </div>

          <div className="fade-up mt-10">
            <p className="eyebrow">Paso 2 de 2</p>
            <h1 className="mt-2 font-display text-[34px] leading-[1.06] tracking-[-0.02em] text-foreground">
              ¿Dónde querés
              <br />
              <span className="italic text-primary">rescatar hoy?</span>
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Elegí tu ciudad para ver las ofertas más cercanas. Podés cambiarla cuando quieras.
            </p>
          </div>

          <div className="mt-7 space-y-2.5">
            {cities.map((c) => {
              const active = picked === c.name;
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setPicked(c.name)}
                  className={cn(
                    'press flex w-full items-center gap-3 rounded-[22px] p-4 text-left ring-1 transition',
                    active ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card ring-border/70'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-sage text-forest'
                    )}
                  >
                    <MapPin className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{c.name}</span>
                    <span className={cn('block text-[11.5px]', active ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
                      {c.province}
                    </span>
                  </span>
                  {active && <Check className="h-5 w-5" strokeWidth={2.6} />}
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => onDone(picked)} className="btn-primary press mt-6 h-[54px] w-full">
            Ver ofertas en {picked}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Al continuar aceptás los términos y la política de privacidad. No pedimos ubicación para usar
            la app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink">
      <img src={HERO_IMAGE} alt="Panadería artesanal" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/25" />

      <div className="relative flex min-h-screen flex-col px-6 pb-9 pt-12">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="flex items-center gap-2.5">
            <BrandMark size={38} variant="light" />
            <div>
              <p className="font-heading text-[12px] font-extrabold uppercase tracking-[0.16em] text-primary-foreground">
                No lo dejes ir
              </p>
              <p className="text-[11px] text-primary-foreground/60">Rescatá comida. Gastá menos.</p>
            </div>
          </div>

          <div className="fade-up mt-auto pt-16">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/55">
              Paso 1 de 2
            </p>
            <h1 className="mt-3 font-display text-[40px] leading-[1.02] tracking-[-0.02em] text-primary-foreground">
              La comida rica
              <br />
              no debería
              <br />
              <span className="italic text-accent">terminar en la basura.</span>
            </h1>
            <p className="mt-4 max-w-[36ch] text-[13.5px] leading-relaxed text-primary-foreground/70">
              Los comercios de tu ciudad publican cada día su excedente en buen estado a un precio mucho
              menor. Reservás, pagás desde el celular y lo retirás.
            </p>

            <div className="mt-6 space-y-2">
              {[
                { t: 'Hasta 70% menos', d: 'Precios de rescate sobre el valor original.' },
                { t: 'Retiro en el local', d: 'Coordinás el horario y mostrás tu QR.' },
                { t: 'Menos desperdicio', d: 'Cada paquete evita que se tire comida.' },
              ].map((item) => (
                <div
                  key={item.t}
                  className="flex items-center gap-3 rounded-[20px] bg-primary-foreground/10 px-4 py-3 ring-1 ring-primary-foreground/15 backdrop-blur-md"
                >
                  <Leaf className="h-4 w-4 shrink-0 text-primary-foreground/80" />
                  <p className="text-[12.5px] leading-snug text-primary-foreground/85">
                    <span className="font-bold text-primary-foreground">{item.t}</span> · {item.d}
                  </p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="press mt-7 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-primary-foreground text-[15px] font-bold text-forest"
            >
              Empezar
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}