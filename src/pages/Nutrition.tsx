import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { SPANISH_RECIPES } from '../data/spanishRecipes';
import { AssignNutritionModal } from '../components/AssignNutritionModal';
import type { NutritionPlanV2 } from '../types';
import {
  Apple, Plus, ChefHat, Target, TrendingDown, TrendingUp,
  Activity, Trash2, Calendar, BarChart3, Zap, UserCheck, Users,
  BookOpen, UtensilsCrossed, Flame, Search,
} from 'lucide-react';

export const Nutrition: React.FC = () => {
  const navigate = useNavigate();
  const { nutritionPlansV2, athletes, deleteNutritionPlanV2 } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'plans'>('overview');
  const [assigningPlan, setAssigningPlan] = useState<NutritionPlanV2 | null>(null);

  const goalLabel: Record<string, string> = {
    lose_weight: 'Pérdida de Peso',
    maintain: 'Mantenimiento',
    gain_muscle: 'Ganar Músculo',
    performance: 'Rendimiento',
    health: 'Salud General',
  };

  const totalRecipes = SPANISH_RECIPES.length;
  const airfryerRecipes = SPANISH_RECIPES.filter(r => r.isAirfryer).length;
  const athleteRecipes = SPANISH_RECIPES.filter(r => r.forAthletes).length;

  return (
    <>
    <Layout>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Apple className="w-7 h-7 text-green-500" />
              Nutrición
            </h1>
            <p className="text-slate-500 text-sm mt-1">Planificación nutricional personalizada con recetas españolas</p>
          </div>
          <button
            onClick={() => navigate('/nutrition/wizard')}
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
                { label: 'Planes Activos', value: nutritionPlansV2.length, icon: <ChefHat className="w-5 h-5 text-green-500" />, bg: 'bg-green-50' },
                { label: 'Recetas Totales', value: totalRecipes, icon: <Apple className="w-5 h-5 text-orange-500" />, bg: 'bg-orange-50' },
                { label: 'Recetas Airfryer', value: airfryerRecipes, icon: <Flame className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
                { label: 'Recetas Deportistas', value: athleteRecipes, icon: <Activity className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/nutrition/wizard')}
                className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl p-6 text-left hover:opacity-95 transition shadow-md"
              >
                <ChefHat className="w-8 h-8 mb-3 opacity-90" />
                <h3 className="font-bold text-lg">Crear Plan Nutricional</h3>
                <p className="text-green-100 text-sm mt-1">Genera un plan semanal personalizado con cuestionario de nutricionista</p>
              </button>
              <button
                onClick={() => navigate('/nutrition/recipes')}
                className="bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-2xl p-6 text-left hover:opacity-95 transition shadow-md"
              >
                <BookOpen className="w-8 h-8 mb-3 opacity-90" />
                <h3 className="font-bold text-lg">Biblioteca de Recetas</h3>
                <p className="text-orange-100 text-sm mt-1">{totalRecipes} recetas saludables españolas con filtros por categoría, dieta y alergias</p>
              </button>
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <Zap className="w-8 h-8 text-purple-500 mb-3" />
                <h3 className="font-bold text-lg text-slate-800">Sistema Inteligente</h3>
                <p className="text-slate-500 text-sm mt-1">Generación automática con detección de alergias, intolerancias, patologías y sistema de intercambios</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {['TDEE', 'Intercambios', 'Patologías', 'Airfryer'].map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full font-medium">{tag}</span>
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

        {/* PLANS */}
        {activeTab === 'plans' && (
          <div>
            {nutritionPlansV2.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ChefHat className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Sin planes nutricionales</h3>
                <p className="text-slate-400 text-sm mb-6">Genera tu primer plan con el asistente de nutricionista</p>
                <button
                  onClick={() => navigate('/nutrition/wizard')}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition"
                >
                  Crear plan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {nutritionPlansV2.map(plan => {
                  const modeLabel = plan.mode === 'blocks'
                    ? `${plan.weekCount / 2} bloque${plan.weekCount > 2 ? 's' : ''} de 2 semanas`
                    : `${plan.weekCount} semana${plan.weekCount > 1 ? 's' : ''}`;
                  return (
                  <div key={plan.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-slate-800 text-sm pr-2">{plan.name}</h3>
                      <button onClick={() => deleteNutritionPlanV2(plan.id)} className="text-slate-300 hover:text-red-400 transition flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{plan.days.length} días · {modeLabel}</span>
                    </div>
                    {plan.context?.dietType && (
                      <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium mb-3">
                        {plan.context.dietType === 'omnivore' ? 'Omnívora' : plan.context.dietType === 'vegetarian' ? 'Vegetariana' : plan.context.dietType === 'vegan' ? 'Vegana' : plan.context.dietType === 'pescetarian' ? 'Pescetariana' : 'Mediterránea'}
                      </span>
                    )}
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
                    {/* Assigned athlete */}
                    {plan.athleteId && (() => {
                      const athlete = athletes.find(a => a.id === plan.athleteId);
                      return athlete ? (
                        <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 bg-green-50 rounded-lg">
                          <Users className="w-3.5 h-3.5 text-green-600" />
                          <span className="text-xs text-green-700 font-medium">{athlete.name}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => navigate(`/nutrition/plan/${plan.id}`)}
                        className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                      >
                        Ver Menú
                      </button>
                      <button
                        onClick={() => setAssigningPlan(plan as any)}
                        className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Asignar
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
    {assigningPlan && (
      <AssignNutritionModal
        plan={assigningPlan as any}
        onClose={() => setAssigningPlan(null)}
        onAssigned={() => setAssigningPlan(null)}
      />
    )}
    </>
  );
};
