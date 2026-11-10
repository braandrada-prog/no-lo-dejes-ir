import { useState } from 'react';

export function useCity() {
  const [city, setCity] = useState('Pergamino');
  const [cityData, setCityData] = useState(null);

  // Debe retornar un ARRAY si en Home.jsx usas corchetes []
  return [city, setCity, cityData]; 
}