import {
  Apple,
  Cake,
  Carrot,
  Coffee,
  Croissant,
  Drumstick,
  Package,
  ShoppingBasket,
  Sprout,
  Store,
  UtensilsCrossed,
} from 'lucide-react';

export const CATEGORIES = [
  { name: 'Panaderías', slug: 'panaderias', icon: Croissant },
  { name: 'Confiterías', slug: 'confiterias', icon: Cake },
  { name: 'Pastelerías', slug: 'pastelerias', icon: Cake },
  { name: 'Restaurantes', slug: 'restaurantes', icon: UtensilsCrossed },
  { name: 'Rotiserías', slug: 'rotiserias', icon: Drumstick },
  { name: 'Supermercados', slug: 'supermercados', icon: ShoppingBasket },
  { name: 'Verdulerías', slug: 'verdulerias', icon: Carrot },
  { name: 'Fruterías', slug: 'fruterias', icon: Apple },
  { name: 'Almacenes', slug: 'almacenes', icon: Store },
  { name: 'Dietéticas', slug: 'dieteticas', icon: Sprout },
  { name: 'Cafeterías', slug: 'cafeterias', icon: Coffee },
  { name: 'Otros alimentos', slug: 'otros', icon: Package },
];

export const categoryIcon = (name) =>
  CATEGORIES.find((c) => c.name === name)?.icon || Package;

export const CITIES = [
  { name: 'Pergamino', lat: -33.8895, lng: -60.5736 },
  { name: 'Salto', lat: -34.2886, lng: -60.2514 },
  { name: 'Junín', lat: -34.5847, lng: -60.9458 },
  { name: 'Arrecifes', lat: -34.0667, lng: -60.1081 },
  { name: 'Rojas', lat: -34.1953, lng: -60.7367 },
  { name: 'San Nicolás de los Arroyos', lat: -33.3345, lng: -60.2250 },
  { name: 'Chacabuco', lat: -34.6400, lng: -60.4700 },
];