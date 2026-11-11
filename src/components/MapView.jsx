import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { ars } from '../lib/format';

// Colores de los puntos del mapa (Leaflet no usa las variables de Tailwind)
const OFFER_COLOR = '#7539d0'; // morado de la marca
const USER_COLOR = '#f0862f'; // naranja: "estás acá"

// MapContainer solo usa `center` al crearse: si la ciudad cambia después, hay que
// mover el mapa a mano. Este componente lo hace cada vez que cambian las coordenadas.
function Recenter({ position }) {
  const map = useMap();
  const [lat, lng] = position;

  useEffect(() => {
    map.setView([lat, lng], 13, { animate: true });
  }, [map, lat, lng]);

  return null;
}

export default function MapView({ offers = [], center, userPoint }) {
  const points = offers.filter((o) => Number(o.lat) && Number(o.lng));

  // Coordenadas centradas por defecto en la región (Salto / Pergamino)
  const defaultCenter = [Number(center?.lat) || -34.2969, Number(center?.lng) || -60.2537];

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-[26px] ring-1 ring-border shadow-sm">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <Recenter position={defaultCenter} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userPoint && (
          <CircleMarker
            center={[Number(userPoint.lat), Number(userPoint.lng)]}
            radius={8}
            pathOptions={{ color: USER_COLOR, fillColor: USER_COLOR, fillOpacity: 0.9 }}
          >
            <Popup>Estás acá</Popup>
          </CircleMarker>
        )}

        {points.map((offer) => (
          <CircleMarker
            key={offer.id}
            center={[Number(offer.lat), Number(offer.lng)]}
            radius={12}
            pathOptions={{ color: OFFER_COLOR, fillColor: OFFER_COLOR, fillOpacity: 0.85 }}
          >
            <Popup>
              <Link to={`/oferta/${offer.id}`} className="block text-xs text-foreground hover:underline">
                <strong className="font-bold">{offer.title}</strong>
                <br />
                <span className="text-muted-foreground">{offer.merchant_name || offer.business_name}</span>
                <br />
                <span className="font-semibold text-primary">{ars(offer.rescue_price)}</span>
              </Link>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
