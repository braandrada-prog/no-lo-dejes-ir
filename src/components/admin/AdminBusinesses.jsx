import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';
import CitySelect from '../CitySelect';
import LocationPicker from '../LocationPicker';
import { logAction } from '../../lib/audit';
import { checkBusinessLocation, geocodeAddress } from '../../lib/geocoding';

// Diagnóstico de la ubicación guardada (null, lejos de la ciudad u OK).
function LocationBadge({ business }) {
  const check = checkBusinessLocation(business);
  const styles = {
    missing: ['Sin ubicación', 'bg-destructive/10 text-destructive'],
    far: [`A ${check.km} km de la ciudad`, 'bg-destructive/10 text-destructive'],
    unknown_city: ['Ciudad sin centro', 'bg-amber-100 text-amber-800'],
    ok: ['OK', 'bg-primary/10 text-primary'],
  };
  const [text, cls] = styles[check.status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{text}</span>;
}

// Columnas reales de public.businesses que se editan desde el admin
const EMPTY = {
  name: '',
  email: '',
  address: '',
  city: '',
  lat: '',
  lng: '',
  status: 'active',
};

// Solo se envían a Supabase las columnas del formulario (sin id, owner_id, rating, etc.)
const FIELDS = Object.keys(EMPTY);

// Consulta pura (sin estado de React): se usa al montar y al recargar
async function fetchBusinesses() {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .order('name', { ascending: true })
    .limit(200);
  if (error) console.error('Error cargando comercios:', error);
  return { data: data ?? [], error };
}

export default function AdminBusinesses({ user }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const applyResult = useCallback(({ data, error: loadError }) => {
    if (loadError) {
      setError('No pudimos cargar los comercios.');
      return;
    }
    setItems(data);
  }, []);

  const load = useCallback(async () => applyResult(await fetchBusinesses()), [applyResult]);

  useEffect(() => {
    let alive = true;
    fetchBusinesses().then((result) => {
      if (alive) applyResult(result);
    });
    return () => {
      alive = false;
    };
  }, [applyResult]);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    const payload = {};
    FIELDS.forEach((key) => {
      payload[key] = form[key] ?? null;
    });
    payload.email = form.email || null;
    payload.lat = form.lat !== '' && form.lat != null ? Number(form.lat) : null;
    payload.lng = form.lng !== '' && form.lng != null ? Number(form.lng) : null;

    const location = checkBusinessLocation(payload);
    if (location.status === 'far') {
      setError(`El pin está a ${location.km} km de ${payload.city}. Ubicá el comercio en el mapa antes de guardar.`);
      setBusy(false);
      return;
    }

    // Un comercio creado desde el admin no tiene dueño (owner_id vacío): nadie puede
    // administrarlo desde el portal de comerciantes hasta que se le asigne uno.
    const result = form.id
      ? await supabase.from('businesses').update(payload).eq('id', form.id)
      : await supabase.from('businesses').insert({ id: crypto.randomUUID(), ...payload });

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

  // Filas con una mutación en curso: deshabilita sus botones (evita doble clic).
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const setPending = (id, on) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // UI optimista: el estado cambia al instante y se revierte si Supabase falla.
  const toggleStatus = async (business) => {
    if (pendingIds.has(business.id)) return;
    setError('');
    const previous = business.status;
    const next = previous === 'active' ? 'suspended' : 'active';

    setPending(business.id, true);
    setItems((list) => list.map((b) => (b.id === business.id ? { ...b, status: next } : b)));

    const { error: updateError } = await supabase
      .from('businesses')
      .update({ status: next })
      .eq('id', business.id);

    if (updateError) {
      console.error('Error cambiando el estado:', updateError);
      setItems((list) => list.map((b) => (b.id === business.id ? { ...b, status: previous } : b)));
      setError('No se pudo cambiar el estado del comercio.');
      setPending(business.id, false);
      return;
    }

    setPending(business.id, false);
    logAction(user, 'business.status', business.name, `Estado: ${next}`);
  };

  // Borrado optimista: la fila desaparece al instante y vuelve a su lugar si falla.
  const remove = async (business) => {
    if (pendingIds.has(business.id)) return;
    if (!window.confirm(`¿Eliminar ${business.name}? Esta acción no se puede deshacer.`)) return;
    setError('');

    const snapshot = items;
    setPending(business.id, true);
    setItems((list) => list.filter((b) => b.id !== business.id));

    const { error: deleteError } = await supabase.from('businesses').delete().eq('id', business.id);
    setPending(business.id, false);

    if (deleteError) {
      console.error('Error eliminando el comercio:', deleteError);
      setItems(snapshot);
      setError('No se pudo eliminar el comercio. Si tiene publicaciones asociadas, eliminalas o suspendé el comercio.');
      return;
    }

    logAction(user, 'business.delete', business.name, 'Comercio eliminado');
  };

  // ── Corrección de ubicaciones existentes ─────────────────────────────────────
  const problems = items.filter((b) => ['missing', 'far'].includes(checkBusinessLocation(b).status));
  const [fixing, setFixing] = useState(false);
  const [fixReport, setFixReport] = useState('');

  /**
   * Re-geocodifica (Georef AR, calle + altura) los comercios sin ubicación o con el pin
   * lejos de su ciudad. Solo propone coincidencias EXACTAS de dirección y pide
   * confirmación antes de guardar. Los que no se resuelven quedan para ajuste manual.
   */
  const fixLocations = async () => {
    setError('');
    setFixReport('');
    setFixing(true);
    const proposals = [];
    const unresolved = [];

    for (const business of problems) {
      if (!business.address || !business.city) {
        unresolved.push(`${business.name}: sin dirección o ciudad`);
        continue;
      }
      try {
        const [best] = await geocodeAddress({ address: business.address, city: business.city, mode: 'suggest' });
        if (best?.precision === 'address') proposals.push({ business, best });
        else unresolved.push(`${business.name}: no se encontró "${business.address}" con altura exacta`);
      } catch (err) {
        unresolved.push(`${business.name}: error del geocodificador (${err.message})`);
      }
    }

    if (!proposals.length) {
      setFixing(false);
      setFixReport(unresolved.length ? `Sin correcciones automáticas.\n${unresolved.join('\n')}` : 'No hay nada para corregir.');
      return;
    }

    const summary = proposals
      .map(({ business, best }) => `• ${business.name} → ${best.label} (${best.lat.toFixed(5)}, ${best.lng.toFixed(5)})`)
      .join('\n');
    if (!window.confirm(`Se van a actualizar ${proposals.length} ubicación(es):\n\n${summary}\n\n¿Continuar?`)) {
      setFixing(false);
      return;
    }

    let updated = 0;
    for (const { business, best } of proposals) {
      const { error: updateError } = await supabase
        .from('businesses')
        .update({ lat: best.lat, lng: best.lng })
        .eq('id', business.id);
      if (updateError) {
        unresolved.push(`${business.name}: no se pudo guardar (${updateError.message})`);
        continue;
      }
      updated += 1;
      logAction(user, 'business.geocode', business.name, `Ubicación corregida: ${best.label} (${best.lat}, ${best.lng})`);
    }

    setFixing(false);
    setFixReport(
      [`Ubicaciones corregidas: ${updated}.`, ...(unresolved.length ? ['Para revisar a mano (✏️):', ...unresolved] : [])].join(
        '\n'
      )
    );
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

      {problems.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 p-3 text-[11.5px] text-amber-900">
          <span>
            {problems.length} comercio(s) sin ubicación o con el pin lejos de su ciudad: no aparecen bien en el mapa.
          </span>
          <button
            type="button"
            onClick={fixLocations}
            disabled={fixing}
            className="flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            {fixing ? 'Buscando direcciones…' : 'Re-geocodificar'}
          </button>
        </div>
      )}
      {fixReport && (
        <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-muted/60 p-3 font-sans text-[11px] text-foreground">
          {fixReport}
        </pre>
      )}

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
            { key: 'email', label: 'Email de contacto', type: 'email' },
          ].map((field) => (
            <label key={field.key} className="text-[11px] font-medium text-muted-foreground">
              {field.label}
              <input
                type={field.type || 'text'}
                step={field.type === 'number' ? 'any' : undefined}
                required={field.required}
                value={form[field.key] ?? ''}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>
          ))}
          <label className="text-[11px] font-medium text-muted-foreground">
            Ciudad
            <CitySelect
              value={form.city}
              onChange={(city) => setForm({ ...form, city })}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>
          <div className="sm:col-span-2">
            <LocationPicker
              label="Dirección"
              address={form.address}
              onAddressChange={(address) => setForm((prev) => ({ ...prev, address }))}
              city={form.city}
              value={form.lat !== '' && form.lng !== '' ? { lat: form.lat, lng: form.lng } : null}
              onChange={({ lat, lng }) => setForm((prev) => ({ ...prev, lat, lng }))}
              inputClassName="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </div>
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
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Comercio</th>
              <th className="px-3 py-2.5">Ciudad</th>
              <th className="px-3 py-2.5">Ubicación</th>
              <th className="px-3 py-2.5">Calificación</th>
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
                  {!business.owner_id && (
                    <p className="text-[10px] text-amber-600">Sin dueño asignado</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{business.city}</td>
                <td className="px-3 py-2.5">
                  <LocationBadge business={business} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {Number(business.rating) > 0 ? `★ ${Number(business.rating).toFixed(1)}` : '—'}
                </td>
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
                    <button
                      type="button"
                      onClick={() => setForm({ ...business, lat: business.lat ?? '', lng: business.lng ?? '' })}
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(business)}
                      disabled={pendingIds.has(business.id)}
                      aria-busy={pendingIds.has(business.id)}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground disabled:opacity-50"
                    >
                      {business.status === 'active' ? 'Suspender' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(business)}
                      disabled={pendingIds.has(business.id)}
                      className="disabled:opacity-50"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
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
