import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Award, Lock, Mail } from 'lucide-react';
import { useStore } from '../../store/useStore';
// eslint-disable-next-line @typescript-eslint/no-unused-vars

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    await new Promise((r) => setTimeout(r, 400));

    const result = login(email, password);
    setLoading(false);

    if (result === 'ok') {
      const store = useStore.getState();
      if (store.currentUser?.role === 'athlete') {
        // Check if athlete has completed anamnesis
        const user = store.currentUser;
        const athlete = store.athletes.find(a => a.email.toLowerCase() === user!.email.toLowerCase());
        if (athlete && !athlete.anamnesisCompleted) {
          // Athlete created manually - must fill survey first
          navigate('/athlete/complete-survey');
        } else {
          navigate('/athlete/dashboard');
        }
      } else {
        navigate('/dashboard');
      }
    } else if (result === 'pending') {
      setError('Tu cuenta está pendiente de aprobación. Tu entrenador o administrador debe validarla antes de que puedas acceder.');
    } else if (result === 'suspended') {
      setError('Tu cuenta ha sido suspendida. Contacta con el administrador para más información.');
    } else {
      setError('Email o contraseña incorrectos. Verifica tus credenciales.');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900 relative overflow-hidden flex-col items-center justify-center p-12">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>

        {/* Grid decoration */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        <div className="relative z-10 text-center">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-8">
            <Award className="w-14 h-14 text-blue-600" />
          </div>
          <h1 className="text-5xl font-black text-white mb-4 tracking-tight">APD SPORT</h1>
          <p className="text-blue-100 text-xl font-light mb-12">Pro Trainer Platform</p>

          <div className="space-y-6 text-left">
            {[
              { icon: '🏋️', title: 'Planes Personalizados', desc: 'Crea programaciones avanzadas para cada deportista' },
              { icon: '📊', title: 'Seguimiento Completo', desc: 'Monitorea el progreso en tiempo real' },
              { icon: '📤', title: 'Envío Instantáneo', desc: 'Comparte planes por email con un click' },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-4 bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
                <span className="text-2xl">{feat.icon}</span>
                <div>
                  <p className="text-white font-semibold">{feat.title}</p>
                  <p className="text-blue-200 text-sm">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Award className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-blue-800">APD SPORT</h1>
              <p className="text-slate-500 text-xs">Pro Trainer Platform</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Bienvenido</h2>
            <p className="text-slate-500 mb-8">Accede con tu cuenta de entrenador o deportista</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-11 pr-11 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : 'Iniciar Sesión'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              El acceso es solo por invitación. Contacta con tu entrenador/a.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
};
