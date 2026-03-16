import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import {
  Apple, Plus, ChefHat, Target, TrendingDown, TrendingUp,
  Activity, Trash2, Calendar, BarChart3, Zap,
} from 'lucide-react';

export const Nutrition: React.FC = () => {
  const navigate = useNavigate();
  const { nutritionProfiles, nutritionPlans, deleteNutritionProfile, deleteNutritionPlan } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'profiles' | 'plans'>('overview');

  const goalLabel: Record<string, string> = {
    lose_weight: 'Pérdida de Peso',
    maintain: 'Mantenimiento',
    gain_muscle: 'Ganar Músculo',
    performance: 'Rendimiento',
    health: 'Salud General',
  };
  const goalColors: Record<string, string> = {
    lose_weight: 'text-orange-600 bg-orange-50',
    maintain: 'text-blue-600 bg-blue-50',
    gain_muscle: 'text-green-600 bg-green-50',
    performance: 'text-purple-600 bg-purple-50',
    health: 'text-teal-600 bg-teal-50',
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Apple className="w-7 h-7 text-green-500" />
              Nutrición
            </h1>
            <p className="text-slate-500 text-sm mt-1">Planificación nutricional personalizada para deportistas</p>
          </div>
          <button
            onClick={() => navigate('/nutrition/generator')}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Crear Plan Nutricional
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
          {([
            { key: 'overview', label: 'Resumen' },
            { key: 'profiles', label: 'Perfiles' },
            { key: 'plans', label: 'Planes' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Perfiles Creados', value: nutritionProfiles.length, icon: <Activity className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
                { label: 'Planes Activos', value: nutritionPlans.length, icon: <ChefHat className="w-5 h-5 text-green-500" />, bg: 'bg-green-50' },
                { label: 'Recetas en BD', value: '32', icon: <Apple className="w-5 h-5 text-orange-500" />, bg: 'bg-orange-50' },
                { label: 'Alimentos en BD', value: '98', icon: <BarChart3 className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
                    {stat.icon}
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => navigate('/nutrition/generator')}
                className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl p-6 text-left hover:opacity-95 transition shadow-md"
              >
                <ChefHat className="w-8 h-8 mb-3 opacity-90" />
                <h3 className="font-bold text-lg">Crear Plan Nutricional</h3>
                <p className="text-green-100 text-sm mt-1">Genera un menú semanal personalizado con recetas españolas basado en tus objetivos y preferencias</p>
              </button>
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <Zap className="w-8 h-8 text-amber-500 mb-3" />
                <h3 className="font-bold text-lg text-slate-800">Base de Datos Española</h3>
                <p className="text-slate-500 text-sm mt-1">Más de 98 alimentos típicos de España con sus macronutrientes y 32 recetas tradicionales adaptadas al deporte</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {['Mediterránea', 'Tradicional', 'Sport', 'Equilibrada'].map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: <TrendingDown className="w-5 h-5 text-orange-500" />, title: 'Pérdida de Grasa', desc: 'Déficit calórico moderado (300-500 kcal) con alta proteína para preservar músculo' },
                { icon: <TrendingUp className="w-5 h-5 text-green-500" />, title: 'Ganancia Muscular', desc: 'Superávit controlado (200-300 kcal) con distribución de macros optimizada' },
                { icon: <Target className="w-5 h-5 text-blue-500" />, title: 'Rendimiento Deportivo', desc: 'Timing nutricional y estrategias de carbohidratos para máximo rendimiento' },
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center mb-3">{card.icon}</div>
                  <h4 className="font-semibold text-slate-800 text-sm">{card.title}</h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROFILES */}
        {activeTab === 'profiles' && (
          <div>
            {nutritionProfiles.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Sin perfiles nutricionales</h3>
                <p className="text-slate-400 text-sm mb-6">Crea un plan nutricional para empezar</p>
                <button
                  onClick={() => navigate('/nutrition/generator')}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition"
                >
                  Crear primer plan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {nutritionProfiles.map(profile => (
                  <div key={profile.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${goalColors[profile.goal] || 'text-slate-600 bg-slate-100'}`}>
                        {goalLabel[profile.goal] || profile.goal}
                      </span>
                      <button onClick={() => deleteNutritionProfile(profile.id)} className="text-slate-300 hover:text-red-400 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div><p className="text-slate-400 text-xs">Peso</p><p className="font-semibold">{profile.weight} kg</p></div>
                      <div><p className="text-slate-400 text-xs">Altura</p><p className="font-semibold">{profile.height} cm</p></div>
                      <div><p className="text-slate-400 text-xs">Calorías</p><p className="font-semibold">{profile.targetCalories} kcal</p></div>
                      <div><p className="text-slate-400 text-xs">Proteína</p><p className="font-semibold">{profile.targetProtein} g</p></div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { label: `P: ${profile.targetProtein}g`, color: 'bg-blue-100 text-blue-700' },
                        { label: `C: ${profile.targetCarbs}g`, color: 'bg-amber-100 text-amber-700' },
                        { label: `G: ${profile.targetFat}g`, color: 'bg-red-100 text-red-700' },
                      ].map(tag => (
                        <span key={tag.label} className={`px-2 py-0.5 rounded text-xs font-medium ${tag.color}`}>{tag.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PLANS */}
        {activeTab === 'plans' && (
          <div>
            {nutritionPlans.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ChefHat className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Sin planes nutricionales</h3>
                <p className="text-slate-400 text-sm mb-6">Genera tu primer plan con el asistente</p>
                <button
                  onClick={() => navigate('/nutrition/generator')}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition"
                >
                  Crear plan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {nutritionPlans.map(plan => (
                  <div key={plan.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-slate-800 text-sm pr-2">{plan.name}</h3>
                      <button onClick={() => deleteNutritionPlan(plan.id)} className="text-slate-300 hover:text-red-400 transition flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{plan.days.length} días planificados · {plan.weeks} semanas</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div><p className="text-slate-400 text-xs">Calorías/día</p><p className="font-semibold">{plan.targetCalories} kcal</p></div>
                      <div><p className="text-slate-400 text-xs">Proteína/día</p><p className="font-semibold">{plan.targetProtein} g</p></div>
                    </div>
                    {/* Macro bars */}
                    <div className="space-y-1.5">
                      {[
                        { label: 'Proteína', value: plan.targetProtein * 4, color: 'bg-blue-400', total: plan.targetCalories },
                        { label: 'Carbos', value: plan.targetCarbs * 4, color: 'bg-amber-400', total: plan.targetCalories },
                        { label: 'Grasas', value: plan.targetFat * 9, color: 'bg-red-400', total: plan.targetCalories },
                      ].map(bar => (
                        <div key={bar.label} className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-14">{bar.label}</span>
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${bar.color} rounded-full`}
                              style={{ width: `${Math.min(100, (bar.value / bar.total) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{Math.round((bar.value / bar.total) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => navigate(`/nutrition/plan/${plan.id}`)}
                      className="mt-4 w-full py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                    >
                      Ver Menú Semanal
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};
