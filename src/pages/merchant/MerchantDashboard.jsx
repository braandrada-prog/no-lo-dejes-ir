import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import CitySelect from '../../components/CitySelect';
import { todayAR, toArgISO, isoToArgParts } from '../../lib/argTime';

// "18:00" de hoy en hora argentina -> fecha ISO
const toArgentinaISO = (time) => toArgISO(todayAR(), time);

const formatTime = (iso) => isoToArgParts(iso).time || '--:--';

const STATUS_STYLES = {
  active: ['Activo', 'bg-green-100 text-green-800'],
  sold_out: ['Agotado', 'bg-red-100 text-red-800'],
};

// Consulta pura (sin estado de React). Lanza error si falla Supabase.
async function fetchDashboard() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { signedIn: false, business: null, offers: [] };

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (businessError) throw businessError;
  if (!business) return { signedIn: true, business: null, offers: [] };

  const { data: offers, error: offersError } = await supabase
    .from('offers')
    .select('*')
    .eq('merchant_id', business.id)
    .order('created_at', { ascending: false });
  if (offersError) throw offersError;

  return { signedIn: true, business, offers: offers ?? [] };
}

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Perfil del comercio
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Nueva oferta
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [stock, setStock] = useState('');
  const [pickupStart, setPickupStart] = useState('18:00');
  const [pickupEnd, setPickupEnd] = useState('20:00');

  // Vuelca el resultado de fetchDashboard() en el estado del componente
  const applyDashboard = useCallback(
    ({ signedIn, business: businessData, offers: offersData }) => {
      if (!signedIn) {
        navigate('/comercio/login');
        return;
      }
      setBusiness(businessData);
      setOffers(offersData);
      if (!businessData) return;

      setBusinessName(businessData.name || '');
      setAddress(businessData.address || '');
      setCity(businessData.city || '');
      setLat(businessData.lat ?? null);
      setLng(businessData.lng ?? null);
    },
    [navigate]
  );

  // Recarga manual (después de guardar, publicar o al tocar "Reintentar")
  const fetchBusinessAndOffers = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      applyDashboard(await fetchDashboard());
    } catch (err) {
      console.error('Error al cargar el panel de comercio:', err.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [applyDashboard]);

  // Carga inicial: el estado solo se toca cuando llega la respuesta (y si sigue montado)
  useEffect(() => {
    let alive = true;
    fetchDashboard()
      .then((result) => {
        if (alive) applyDashboard(result);
      })
      .catch((err) => {
        console.error('Error al cargar el panel de comercio:', err.message);
        if (alive) setLoadError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applyDashboard]);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no permite geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => alert('No pudimos obtener la ubicación. Revisá el permiso del navegador.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!business) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          name: businessName,
          address,
          city,
          lat,
          lng,
        })
        .eq('id', business.id);

      if (error) throw error;
      alert('¡Datos del local guardados con éxito!');
      fetchBusinessAndOffers();
    } catch (err) {
      alert('Error al guardar perfil: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!business?.city) {
      alert('Primero guardá la localidad de tu local.');
      return;
    }

    const original = parseFloat(originalPrice);
    const rescue = parseFloat(discountPrice);
    const units = parseInt(stock, 10);

    if (rescue >= original) {
      alert('El precio con descuento tiene que ser menor al precio original.');
      return;
    }
    if (!(units >= 1)) {
      alert('El stock tiene que ser de al menos 1 unidad.');
      return;
    }
    if (pickupEnd <= pickupStart) {
      alert('La hora de fin tiene que ser posterior a la de inicio.');
      return;
    }

    const startISO = toArgentinaISO(pickupStart);
    const endISO = toArgentinaISO(pickupEnd);
    if (new Date(endISO) <= new Date()) {
      alert('El horario de retiro de hoy ya pasó. Elegí un horario posterior.');
      return;
    }

    try {
      const { error } = await supabase.from('offers').insert([
        {
          merchant_id: business.id,
          title,
          description,
          original_price: original,
          rescue_price: rescue,
          quantity_available: units,
          pickup_start: startISO,
          pickup_end: endISO,
          city: business.city,
          status: 'active',
        },
      ]);

      if (error) throw error;

      resetForm();
      setShowModal(false);

      fetchBusinessAndOffers();
    } catch (err) {
      alert('Error al crear la oferta: ' + err.message);
    }
  };

  const resetForm = () => {
   setTitle('');
   setDescription('');
   setOriginalPrice('');
   setDiscountPrice('');
   setStock('');
   setPickupStart('18:00');
   setPickupEnd('20:00');
  };

  const handleRepublish = (offer) => {
    setTitle(offer.title || '');
    setDescription(offer.description || '');
    setOriginalPrice(String(offer.original_price ?? ''));
    setDiscountPrice(String(offer.rescue_price ?? ''));
    setStock(String(offer.quantity_available ?? ''));
    setPickupStart(offer.pickup_start ? formatTime(offer.pickup_start) : '18:00');
    setPickupEnd(offer.pickup_end ? formatTime(offer.pickup_end) : '20:00');
    setShowModal(true);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    // Aunque falle (p. ej. sin conexión), la sesión local se borra igual: se vuelve al login
    if (error) console.error('Error al cerrar sesión:', error);
    navigate('/comercio/login');
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-600">Cargando panel de comercio...</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white shadow rounded-lg p-8 max-w-md text-center space-y-4">
          <h1 className="text-lg font-bold text-gray-900">No pudimos cargar tu panel</h1>
          <p className="text-sm text-gray-600">Revisá tu conexión e intentá de nuevo.</p>
          <button
            onClick={fetchBusinessAndOffers}
            className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white shadow rounded-lg p-8 max-w-md text-center space-y-4">
          <h1 className="text-lg font-bold text-gray-900">Esta cuenta no tiene un comercio asociado</h1>
          <p className="text-sm text-gray-600">
            Ingresá con la cuenta con la que registraste tu comercio, o registrá uno nuevo desde el
            portal de comerciantes.
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium"
          >
            Volver al ingreso
          </button>
        </div>
      </div>
    );
  }

  const isActive = business.status === 'active';

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{business.name || 'Mi Comercio'}</h1>
            <p className="text-sm text-gray-500">Panel exclusivo de gestión para comerciantes</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
        {!isActive && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-sm text-red-700 rounded">
            Tu comercio está suspendido y tus ofertas no se muestran en la app. Contactá a soporte.
          </div>
        )}

        {/* SECCIÓN 1: Datos del local */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">📍 Configuración de tu Local y Zona</h2>
          <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre del Comercio</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Dirección Comercial</label>
              <input
                type="text"
                required
                placeholder="Ej. Av. de Mayo 750"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Localidad / Zona</label>
              <CitySelect
                value={city}
                onChange={setCity}
                className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>

            <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <button
                  type="button"
                  onClick={captureLocation}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  📌 Usar la ubicación de este dispositivo
                </button>
                {lat != null && lng != null ? (
                  <span className="text-green-700">Ubicación del local cargada ✓</span>
                ) : (
                  <span>Opcional: ayuda a mostrar qué tan cerca estás de tus clientes. Hacelo desde el local.</span>
                )}
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-900 shadow-sm"
              >
                {savingProfile ? 'Guardando...' : 'Guardar datos del local'}
              </button>
            </div>
          </form>
        </div>

        {/* SECCIÓN 2: Ofertas */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Tus Packs Sorpresa</h2>
            <button
              onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            disabled={!isActive}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium shadow-sm text-sm"
          >
            + Publicar Nuevo Pack
          </button>
          </div>

          {offers.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Aún no has publicado ningún pack sorpresa. ¡Crea el primero!
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {offers.map((offer) => {
                const [label, style] = STATUS_STYLES[offer.status] || [offer.status, 'bg-gray-100 text-gray-700'];
                return (
                  <li key={offer.id} className="py-4 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{offer.title}</h3>
                      <p className="text-sm text-gray-500">{offer.description}</p>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm">
                        <span className="text-gray-400 line-through">${offer.original_price}</span>
                        <span className="text-green-600 font-bold">${offer.rescue_price}</span>
                        <span className="text-gray-600">Stock: {offer.quantity_available}</span>
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-semibold">
                          ⏰ Retiro: {formatTime(offer.pickup_start)} a {formatTime(offer.pickup_end)} hs
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${style}`}>{label}</span>
                      <button
                        onClick={() => handleRepublish(offer)}
                        disabled={!isActive}
                        className="px-3 py-1.5 border border-green-600 text-green-700 rounded-md text-xs font-semibold hover:bg-green-50 disabled:opacity-50"
                     >
                      🔁 Republicar
                     </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {/* MODAL: publicar pack */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Publicar Pack Sorpresa</h3>
            <p className="text-xs text-gray-500">
              El retiro es hoy, en el horario que elijas. Revisá el stock antes de publicar.
            </p>
            <form onSubmit={handleCreateOffer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título del Pack</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Surtido de Panadería del Día"
                  className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Incluye facturas y pan fresco sobrante"
                  className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  rows="2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Precio Original ($)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="10000"
                    className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Precio con Descuento ($)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    placeholder="3500"
                    className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Stock</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="5"
                    className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Retiro Desde</label>
                  <input
                    type="time"
                    required
                    value={pickupStart}
                    onChange={(e) => setPickupStart(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hasta</label>
                  <input
                    type="time"
                    required
                    value={pickupEnd}
                    onChange={(e) => setPickupEnd(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium shadow-sm"
                >
                  Publicar Pack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}