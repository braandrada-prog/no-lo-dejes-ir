import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Compara nombres sin tildes ni mayúsculas ("Salto" = "salto")
export const normalize = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export async function getCurrentCoords() {
  // En la app Android hay que pedir el permiso; en el navegador lo pide solo
  if (Capacitor.isNativePlatform()) {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      permission = await Geolocation.requestPermissions();
    }
    if (permission.location !== 'granted') throw new Error('permission-denied');
  }

  const { coords } = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });
  return { lat: coords.latitude, lng: coords.longitude };
}

export async function reverseCity({ lat, lng }) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=es`
  );
  if (!response.ok) throw new Error('geocoding-failed');

  const { address = {} } = await response.json();
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    (address.county || '').replace(/^Partido de /i, '') ||
    null
  );
}