import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import { CATEGORIES, CITIES } from '../../lib/categories';
import { logAction } from '../../lib/audit';

const EMPTY = {
  name: '',
  category: 'Panaderías',
  description: '',
  address: '',
  city: 'Salto',
  phone: '',
  image_url: '',
  lat: '',
  lng: '',
  status: 'active',
};

// Solo se envían a Supabase las columnas del formulario (sin id, created_at, etc.)
const FIELDS = Object.keys(EMPTY);

export default function AdminBusinesses({ user }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('businesses')
      .select('*')
      .order('name', { ascending: true })
      .limit(200);

    if (loadError) {
      console.error('Error cargando comercios:', loadError);
      setError('No pudimos cargar los comercios.');
      return;
    }
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    const payload = {};
    FIELDS.forEach((key) => {
      payload[key] = form[key] ?? null;
    });
    payload.lat = form.lat !== '' && form.lat != null ? Number(form.lat) : null;
    payload.lng = form.lng !== '' && form.lng != null ? Number(form.lng) : null;

    const result = form.id
      ? await supabase.from('businesses').update(payload).eq('id', form.id)
      : await supabase.from('businesses').insert(payload);

    if (result.error) {
      console.error('Error guardando el comercio:', result.error);
      setError('No se pudo guardar el comercio. Revisá la consola.');
      setBusy(false);
      return;
    }

    if (form.id) {
      await logAction(user, 'business.update', form.name, 'Datos del comercio actualizados');
    } else {
      await logAction(user, 'business.create', form.name, 'Alta de comercio');
    }
    setBusy(false);
    setForm(null);
    await load();
  };

  const toggleStatus = async (business) => {
    setError('');
    const next = business.status === 'active' ? 'suspended' : 'active';

    const { error: updateError } = await supabase
      .from('businesses')
      .update({ status: next })
      .eq('id', business.id);

    if (updateError) {
      console.error('Error cambiando el estado:', updateError);
      setError('No se pudo cambiar el estado del comercio.');
      return;
    }

    await logAction(user, 'business.status', business.name, `Estado: ${next}`);
    await load();
  };

  const remove = async (business) => {
    if (!window.confirm(`¿Eliminar ${business.name}? Esta acción no se puede deshacer.`)) return;
    setError('');

    const { error: deleteError } = await supabase.from('businesses').delete().eq('id', business.id);

    if (deleteError) {
      console.error('Error eliminando el comercio:', deleteError);
      setError('No se pudo eliminar el comercio. Si tiene publicaciones asociadas, eliminalas o suspendé el comercio.');
      return;
    }

    await logAction(user, 'business.delete', business.name, 'Comercio eliminado');
    await load();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Comercios ({items.length})</p>
        <button
          type="button"
          onClick={() => {
            setError('');
            setForm({ ...EMPTY });
          }}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo comercio
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {form && (
        <form onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <p className="text-xs font-semibold">{form.id ? 'Editar comercio' : 'Alta de comercio'}</p>
            <button type="button" onClick={() => setForm(null)} aria-label="Cerrar formulario">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {[
            { key: 'name', label: 'Nombre', required: true },
            { key: 'address', label: 'Dirección', required: true },
            { key: 'phone', label: 'Teléfono' },
            { key: 'image_url', label: 'URL de foto' },
            { key: 'lat', label: 'Latitud' },
            { key: 'lng', label: 'Longitud' },
          ].map((field) => (
            <label key={field.key} className="text-[11px] font-medium text-muted-foreground">
              {field.label}
              <input
                required={field.required}
                value={form[field.key] ?? ''}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>
          ))}
          <label className="text-[11px] font-medium text-muted-foreground">
            Categoría
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-medium text-muted-foreground">
            Ciudad
            <select
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              {CITIES.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Descripción
            <textarea
              value={form.description || ''}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Comercio</th>
              <th className="px-3 py-2.5">Ciudad</th>
              <th className="px-3 py-2.5">Categoría</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((business) => (
              <tr key={business.id} className="border-t border-border/70">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{business.name}</p>
                  <p className="text-[10px] text-muted-foreground">{business.address}</p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{business.city}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{business.category}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      business.status === 'active'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {business.status === 'active' ? 'Activo' : 'Suspendido'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => setForm({ ...business })} title="Editar" aria-label="Editar">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(business)}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {business.status === 'active' ? 'Suspender' : 'Activar'}
                    </button>
                    <button type="button" onClick={() => remove(business)} title="Eliminar" aria-label="Eliminar">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Todavía no hay comercios cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}