import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

import ScrollToTop from './components/ScrollToTop';
import Layout from './components/Layout';
import PageNotFound from './components/PageNotFound';

import Home from './pages/Home';
import Explore from './pages/Explore';
import OfferDetail from './pages/OfferDetail';
import Checkout from './pages/Checkout';
import Purchases from './pages/Purchases';
import OrderDetail from './pages/OrderDetail';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Help from './pages/Help';
import Legal from './pages/Legal';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import { supabase } from './services/supabaseClient';

// Admin se carga solo cuando se entra a /admin
const Admin = lazy(() => import('./pages/Admin'));

// Portal de Comerciantes (se carga solo cuando entra un comercio)
const MerchantLogin = lazy(() => import('./pages/merchant/MerchantLogin'));
const MerchantDashboard = lazy(() => import('./pages/merchant/MerchantDashboard'));

function App() {
  // Listener seguro para capturar el retorno nativo de Google OAuth en Capacitor
  useEffect(() => {
    let cancelled = false;
    let handle = null;

    const setupListener = async () => {
      const listener = await CapApp.addListener('appUrlOpen', async (event) => {
        const url = event.url;
        if (url && url.includes('nolodejesir://callback')) {
          const queryString = url.split('#')[1] || url.split('?')[1];
          if (queryString) {
            const urlParams = new URLSearchParams(queryString);
            const accessToken = urlParams.get('access_token');
            const refreshToken = urlParams.get('refresh_token');

            if (accessToken && refreshToken) {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) {
                console.error('No se pudo iniciar la sesión con Google:', error);
                window.location.href = '/login';
                return;
              }
              window.location.href = '/';
            }
          }
        }
      });

      // Si el componente se desmontó mientras se registraba, lo quitamos enseguida
      if (cancelled) listener.remove();
      else handle = listener;
    };

    setupListener().catch((error) =>
      console.error('No se pudo registrar el listener de OAuth:', error)
    );

    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Autenticación con Supabase (Consumidores) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login initialMode="register" />} />
        <Route path="/forgot-password" element={<Login initialMode="forgot" />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Portal Web exclusivo para Comerciantes (Sin la barra de navegación de la app móvil) */}
        <Route
          path="/comercio/login"
          element={
            <Suspense fallback={<div style={{ padding: 24 }}>Cargando portal...</div>}>
              <MerchantLogin />
            </Suspense>
          }
        />
        <Route
          path="/comercio/dashboard"
          element={
            <Suspense fallback={<div style={{ padding: 24 }}>Cargando panel...</div>}>
              <MerchantDashboard />
            </Suspense>
          }
        />

        {/* App del consumidor, con barra de navegación inferior */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/explorar" element={<Explore />} />
          <Route path="/oferta/:id" element={<OfferDetail />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/compras" element={<Purchases />} />
          <Route path="/compras/:id" element={<OrderDetail />} />
          <Route path="/favoritos" element={<Favorites />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/perfil/notificaciones" element={<Notifications />} />
          <Route path="/ayuda" element={<Help />} />
          <Route path="/legal/:doc" element={<Legal />} />
        </Route>

        {/* Panel de administración (sin barra inferior) */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
              <Admin />
            </Suspense>
          }
        />

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Router>
  );
}

export default App;