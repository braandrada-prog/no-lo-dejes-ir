import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function MerchantLogin() {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegistering) {
        // Registrar usuario en Supabase Auth. El trigger on_auth_user_created (handle_new_merchant)
        // crea la fila en public.businesses con owner_id = id del usuario, usando business_name.
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              business_name: businessName, // Esto se pasa automáticamente al trigger
            }
          }
        });

        if (signUpError) throw signUpError;

        if (signUpData.session) {
          // Confirmación de email desactivada: ya quedó con sesión iniciada
          navigate('/comercio/dashboard');
        } else {
          alert('¡Registro exitoso! Revisá tu correo para confirmar la cuenta y después iniciá sesión.');
          setIsRegistering(false);
        }
      } else {
        // Iniciar sesión
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        navigate('/comercio/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          {isRegistering ? 'Registra tu Comercio' : 'Portal de Comerciantes'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isRegistering ? 'Publica tus packs sorpresa y llega a más clientes' : 'Ingresa para administrar tus publicaciones'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleAuth}>
            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre del Local / Negocio</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                    placeholder="Ej. Panadería Don José"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  placeholder="comercio@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                {loading ? 'Procesando...' : isRegistering ? 'Registrar Negocio' : 'Iniciar Sesión'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-green-600 hover:text-green-500 font-medium"
            >
              {isRegistering ? '¿Ya tienes cuenta? Inicia sesión aquí' : '¿Nuevo comercio? Regístrate aquí'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}