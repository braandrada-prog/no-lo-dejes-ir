import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import { ars, pct } from '../../lib/format';
import { logAction } from '../../lib/audit';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString();

const EMPTY = {
  title: '',
  description: '',
  business_id: '',
  category: 'Panaderías',
  city: 'Salto',
  image_url: '',
  original_price: '',
  rescue_price: '',
  quantity_total: '',
  quantity_available: '',
  pickup_date: today(),
  pickup_start: '18:00',
  pickup_end: '20:00',
  expires_at: inDays(1).slice(0, 16),
  storage: '',
  allergens: '',
  surprise: true,
  status: 'active',
};

export default function AdminOffers({ user }) {
  const [offers, setOffers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [offerRes, businessRes] = await Promise.all([
      supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('businesses').select('*').order('name', { ascending: true }).limit(200),
    ]);

    const failed = offerRes.error || businessRes.error;
    if (failed) {
      console.error('Error cargando publicaciones:', failed);
      setError('No pudimos cargar las publicaciones.');
      return;
    }

    setOffers(offerRes.data ?? []);
    setBusinesses(businessRes.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickBusiness = (id) => {
    const business = businesses.find((b) => b.id === id);
    setForm({
      ...form,
      business_id: id,
      city: business?.city || form.city,
      category: business?.category || form.category,
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    const business = businesses.find((b) => b.id === form.business_id);
    if (!business) {
      setError('Elegí un comercio.');
      return;
    }
    if (Number(form.rescue_price) >= Number(form.original_price)) {
      setError('El precio de rescate debe ser menor al precio original.');
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title,
      description: form.description,
      business_id: business.id,
      business_name: business.name,
      business_address: business.address,
      business_phone: business.phone || '',
      category: business.category,
      city: business.city,
      lat: business.lat,
      lng: business.lng,
      image_url: form.image_url,
      original_price: Number(form.original_price),
      rescue_price: Number(form.rescue_price),
      discount_percent: pct(Number(form.original_price), Number(form.rescue_price)),
      quantity_total: Number(form.quantity_total || 0),
      quantity_available: Number(form.quantity_available || form.quantity_total || 0),
      pickup_date: form.pickup_date,
      pickup_start: form.pickup_start,
      pickup_end: form.pickup_end,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : inDays(1),
      storage: form.storage,
      allergens: form.allergens,
      surprise: Boolean(form.surprise),
      status: form.status,
    };

    let result;
    if (form.id) {
      result = await supabase.from('offers').update(payload).eq('id', form.id);
    } else {
      result = await supabase
        .from('offers')
        .insert({ ...payload, published_at: new Date().toISOString() });
    }

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
            setForm({ ...EMPTY, business_id: businesses[0].id, city: businesses[0].city, category: businesses[0].category });
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

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Comercio
            <select
              value={form.business_id}
              onChange={(event) => pickBusiness(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name} · {b.city}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Título del paquete
            <input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Descripción
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {[
            { key: 'original_price', label: 'Precio original', type: 'number', required: true },
            { key: 'rescue_price', label: 'Precio de rescate', type: 'number', required: true },
            { key: 'quantity_total', label: 'Unidades publicadas', type: 'number', required: true },
            { key: 'quantity_available', label: 'Stock disponible', type: 'number' },
            { key: 'pickup_date', label: 'Fecha de retiro', type: 'date' },
            { key: 'pickup_start', label: 'Retiro desde', type: 'time' },
            { key: 'pickup_end', label: 'Retiro hasta', type: 'time' },
            { key: 'expires_at', label: 'Vence la oferta', type: 'datetime-local' },
          ].map((field) => (
            <label key={field.key} className="text-[11px] font-medium text-muted-foreground">
              {field.label}
              <input
                type={field.type}
                required={field.required}
                value={form[field.key] ?? ''}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          ))}

          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Foto (URL)
            <input
              value={form.image_url}
              onChange={(event) => setForm({ ...form, image_url: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="text-[11px] font-medium text-muted-foreground">
            Conservación
            <input
              value={form.storage}
              onChange={(event) => setForm({ ...form, storage: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="text-[11px] font-medium text-muted-foreground">
            Alérgenos
            <input
              value={form.allergens}
              onChange={(event) => setForm({ ...form, allergens: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="text-[11px] font-medium text-muted-foreground">
            Estado
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="active">Activa</option>
              <option value="paused">Pausada</option>
              <option value="sold_out">Agotada</option>
              <option value="draft">Borrador</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={form.surprise}
              onChange={(event) => setForm({ ...form, surprise: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            Es caja sorpresa
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
            {offers.map((offer) => (
              <tr key={offer.id} className="border-t border-border/70">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{offer.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {offer.city} · retiro {offer.pickup_start}–{offer.pickup_end}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{offer.business_name}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{ars(offer.rescue_price)}</p>
                  <p className="text-[10px] text-muted-foreground line-through">{ars(offer.original_price)}</p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {offer.quantity_available}/{offer.quantity_total}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                    {offer.status}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      aria-label="Editar"
                      onClick={() => setForm({ ...offer, expires_at: (offer.expires_at || '').slice(0, 16) })}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button type="button" aria-label="Eliminar" onClick={() => remove(offer)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
