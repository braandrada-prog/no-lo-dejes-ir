import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import { ars, pickupWindow } from '../../lib/format';
import { CATEGORIES } from '../../lib/categories';
import { todayAR, toArgISO, isoToArgParts } from '../../lib/argTime';
import { logAction } from '../../lib/audit';

// Campos del formulario. pickup_date/pickup_start/pickup_end se combinan al guardar
// en dos timestamptz (offers.pickup_start / offers.pickup_end) en hora argentina.
const EMPTY = {
  title: '',
  description: '',
  merchant_id: '',
  category: CATEGORIES[0]?.name || '',
  image_url: '',
  original_price: '',
  rescue_price: '',
  quantity_available: '',
  pickup_date: todayAR(),
  pickup_start: '18:00',
  pickup_end: '20:00',
  status: 'active',
};

// Oferta de la BD -> valores del formulario
const toForm = (offer) => {
  const start = isoToArgParts(offer.pickup_start);
  const end = isoToArgParts(offer.pickup_end);
  return {
    id: offer.id,
    title: offer.title || '',
    description: offer.description || '',
    merchant_id: offer.merchant_id || '',
    category: offer.category || '',
    image_url: offer.image_url || '',
    original_price: offer.original_price ?? '',
    rescue_price: offer.rescue_price ?? '',
    quantity_available: offer.quantity_available ?? '',
    reserved_units: Number(offer.reserved_units) || 0,
    pickup_date: start.date || todayAR(),
    pickup_start: start.time || '18:00',
    pickup_end: end.time || '20:00',
    status: offer.status || 'active',
  };
};

// Consulta pura (sin estado de React): se usa al montar y al recargar
async function fetchOffersAndBusinesses() {
  const [offerRes, businessRes] = await Promise.all([
    supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('businesses').select('*').order('name', { ascending: true }).limit(200),
  ]);
  const error = offerRes.error || businessRes.error;
  if (error) console.error('Error cargando publicaciones:', error);
  return { offers: offerRes.data ?? [], businesses: businessRes.data ?? [], error };
}

export default function AdminOffers({ user }) {
  const [offers, setOffers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const applyResult = useCallback(({ offers: offerList, businesses: businessList, error: loadError }) => {
    if (loadError) {
      setError('No pudimos cargar las publicaciones.');
      return;
    }
    setOffers(offerList);
    setBusinesses(businessList);
  }, []);

  const load = useCallback(async () => applyResult(await fetchOffersAndBusinesses()), [applyResult]);

  useEffect(() => {
    let alive = true;
    fetchOffersAndBusinesses().then((result) => {
      if (alive) applyResult(result);
    });
    return () => {
      alive = false;
    };
  }, [applyResult]);

  // offers.merchant_id es text; businesses.id es uuid
  const businessOf = (merchantId) => businesses.find((b) => String(b.id) === String(merchantId));

  const save = async (event) => {
    event.preventDefault();
    setError('');
    const business = businessOf(form.merchant_id);
    if (!business) {
      setError('Elegí un comercio.');
      return;
    }
    if (Number(form.rescue_price) >= Number(form.original_price)) {
      setError('El precio de rescate debe ser menor al precio original.');
      return;
    }
    if (Number(form.quantity_available || 0) < (form.reserved_units || 0)) {
      setError(`El stock no puede ser menor a las ${form.reserved_units} unidades ya reservadas.`);
      return;
    }
    if (form.pickup_end <= form.pickup_start) {
      setError('La hora de fin del retiro tiene que ser posterior a la de inicio.');
      return;
    }

    const pickupStart = toArgISO(form.pickup_date, form.pickup_start);
    const pickupEnd = toArgISO(form.pickup_date, form.pickup_end);
    if (!form.id && form.status === 'active' && new Date(pickupEnd) <= new Date()) {
      setError('El horario de retiro ya pasó. Elegí una fecha u horario posterior.');
      return;
    }

    setBusy(true);
    const payload = {
      title: form.title,
      description: form.description,
      merchant_id: String(business.id),
      category: form.category || null,
      city: business.city || null,
      image_url: form.image_url || null,
      original_price: Number(form.original_price),
      rescue_price: Number(form.rescue_price),
      quantity_available: Number(form.quantity_available || 0),
      pickup_start: pickupStart,
      pickup_end: pickupEnd,
      status: form.status,
    };

    const result = form.id
      ? await supabase.from('offers').update(payload).eq('id', form.id)
      : await supabase.from('offers').insert(payload);

    if (result.error) {
      console.error('Error guardando la publicación:', result.error);
      setError('No se pudo guardar la publicación. Revisá la consola.');
      setBusy(false);
      return;
    }

    if (form.id) {
      await logAction(user, 'offer.update', form.title, 'Publicación actualizada');
    } else {
      await logAction(user, 'offer.create', form.title, 'Nueva publicación');
    }
    setBusy(false);
    setForm(null);
    await load();
  };

  const remove = async (offer) => {
    if (!window.confirm(`¿Eliminar la publicación "${offer.title}"?`)) return;
    setError('');

    const { error: deleteError } = await supabase.from('offers').delete().eq('id', offer.id);
    if (deleteError) {
      console.error('Error eliminando la publicación:', deleteError);
      setError('No se pudo eliminar la publicación.');
      return;
    }

    await logAction(user, 'offer.delete', offer.title, 'Publicación eliminada');
    await load();
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Publicaciones ({offers.length})</p>
        <button
          type="button"
          onClick={() => {
            if (!businesses.length) {
              setError('Primero cargá un comercio.');
              return;
            }
            setError('');
            setForm({ ...EMPTY, pickup_date: todayAR(), merchant_id: String(businesses[0].id) });
          }}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva oferta
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {form && (
        <form onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <p className="text-xs font-semibold">{form.id ? 'Editar publicación' : 'Nueva publicación'}</p>
            <button type="button" onClick={() => setForm(null)} aria-label="Cerrar formulario">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <label className="text-[11px] font-medium text-muted-foreground">
            Comercio
            <select
              value={form.merchant_id}
              onChange={(event) => setForm({ ...form, merchant_id: event.target.value })}
              className={inputClass}
            >
              {businesses.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name} · {b.city || 'sin ciudad'}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-medium text-muted-foreground">
            Categoría
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className={inputClass}
            >
              <option value="">Sin categoría</option>
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Título del paquete
            <input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className={inputClass}
            />
          </label>

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Descripción
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className={inputClass}
            />
          </label>

          {[
            { key: 'original_price', label: 'Precio original', type: 'number', required: true, min: 1 },
            { key: 'rescue_price', label: 'Precio de rescate', type: 'number', required: true, min: 1 },
            { key: 'quantity_available', label: 'Stock total', type: 'number', required: true, min: 0 },
            { key: 'pickup_date', label: 'Fecha de retiro', type: 'date', required: true },
            { key: 'pickup_start', label: 'Retiro desde', type: 'time', required: true },
            { key: 'pickup_end', label: 'Retiro hasta', type: 'time', required: true },
          ].map((field) => (
            <label key={field.key} className="text-[11px] font-medium text-muted-foreground">
              {field.label}
              <input
                type={field.type}
                required={field.required}
                min={field.min}
                value={form[field.key] ?? ''}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                className={inputClass}
              />
              {field.key === 'quantity_available' && form.reserved_units > 0 && (
                <span className="mt-1 block text-[10px] text-amber-600">
                  {form.reserved_units} unidad(es) reservadas en pedidos pendientes. No bajes el stock por debajo de eso.
                </span>
              )}
            </label>
          ))}

          <label className="text-[11px] font-medium text-muted-foreground">
            Estado
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              className={inputClass}
            >
              <option value="active">Activa</option>
              <option value="paused">Pausada</option>
              <option value="sold_out">Agotada</option>
              <option value="expired">Vencida</option>
              <option value="draft">Borrador</option>
            </select>
          </label>

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Foto (URL)
            <input
              value={form.image_url}
              onChange={(event) => setForm({ ...form, image_url: event.target.value })}
              className={inputClass}
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? 'Guardando…' : 'Guardar publicación'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Oferta</th>
              <th className="px-3 py-2.5">Comercio</th>
              <th className="px-3 py-2.5">Precio</th>
              <th className="px-3 py-2.5">Stock</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => {
              const reserved = Number(offer.reserved_units) || 0;
              const free = (Number(offer.quantity_available) || 0) - reserved;
              const day = isoToArgParts(offer.pickup_start).date;
              return (
                <tr key={offer.id} className="border-t border-border/70">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-foreground">{offer.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {offer.city} · retiro {day ? `${day} · ` : ''}
                      {pickupWindow(offer.pickup_start, offer.pickup_end)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {businessOf(offer.merchant_id)?.name || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-foreground">{ars(offer.rescue_price)}</p>
                    <p className="text-[10px] text-muted-foreground line-through">{ars(offer.original_price)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {free} libres
                    {reserved > 0 && <span className="block text-[10px]">{reserved} reservadas</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                      {offer.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" aria-label="Editar" onClick={() => setForm(toForm(offer))}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button type="button" aria-label="Eliminar" onClick={() => remove(offer)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No hay publicaciones todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
