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
  { name: 'Salto', province: 'Buenos Aires', lat: -34.2969, lng: -60.2537 },
  { name: 'Pergamino', province: 'Buenos Aires', lat: -33.89, lng: -60.5736 },
];