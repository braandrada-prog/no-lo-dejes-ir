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

function App() {
  // Listener para capturar el retorno nativo de Google OAuth en Capacitor
  useEffect(() => {
    const handleAppLaunch = CapApp.addListener('appUrlOpen', async (event) => {
      const url = event.url;
      if (url && url.includes('nolodejesir://callback')) {
        const queryString = url.split('#')[1] || url.split('?')[1];
        if (queryString) {
          const urlParams = new URLSearchParams(queryString);
          const accessToken = urlParams.get('access_token');
          const refreshToken = urlParams.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            window.location.href = '/';
          }
        }
      }
    });

    return () => {
      handleAppLaunch.remove();
    };
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Autenticación con Supabase */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login initialMode="register" />} />
        <Route path="/forgot-password" element={<Login initialMode="forgot" />} />
        <Route path="/reset-password" element={<ResetPassword />} />

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