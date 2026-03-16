import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { RECIPES_DB } from '../data/nutrition';
import {
  ChevronLeft, Calendar, ChefHat, Clock,
  Flame, Beef, Wheat, Droplets, ChevronDown, ChevronUp,
} from 'lucide-react';

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  mid_morning: 'Media Mañana',
  lunch: 'Comida',
  snack: 'Merienda',
  dinner: 'Cena',
  pre_workout: 'Pre-Entreno',
  post_workout: 'Post-Entreno',
};

const MEAL_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-50 border-amber-200',
  mid_morning: 'bg-green-50 border-green-200',
  lunch: 'bg-blue-50 border-blue-200',
  snack: 'bg-purple-50 border-purple-200',
  dinner: 'bg-indigo-50 border-indigo-200',
  pre_workout: 'bg-orange-50 border-orange-200',
  post_workout: 'bg-teal-50 border-teal-200',
};

const MEAL_TEXT_COLORS: Record<string, string> = {
  breakfast: 'text-amber-700',
  mid_morning: 'text-green-700',
  lunch: 'text-blue-700',
  snack: 'text-purple-700',
  dinner: 'text-indigo-700',
  pre_workout: 'text-orange-700',
  post_workout: 'text-teal-700',
};

export const NutritionPlanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { nutritionPlans } = useStore();
  const [selectedDay, setSelectedDay] = useState(0);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);

  const plan = nutritionPlans.find(p => p.id === id);

  if (!plan) {
    return (
      <Layout>
        <div className="p-6 text-center">
          <p className="text-slate-500">Plan no encontrado.</p>
          <button onClick={() => navigate('/nutrition')} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-xl text-sm">
            Volver a Nutrición
          </button>
        </div>
      </Layout>
    );
  }

  const currentDay = plan.days[selectedDay];
  const macroGoalPercents = {
    protein: Math.round((plan.targetProtein * 4 / plan.targetCalories) * 100),
    carbs: Math.round((plan.targetCarbs * 4 / plan.targetCalories) * 100),
    fat: Math.round((plan.targetFat * 9 / plan.targetCalories) * 100),
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/nutrition')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">{plan.name}</h1>
            <p className="text-sm text-slate-400">{plan.days.length} días · {plan.weeks} semanas</p>
          </div>
        </div>

        {/* Macro targets */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Objetivos Diarios</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Calorías', value: plan.targetCalories, unit: 'kcal', icon: <Flame className="w-4 h-4 text-orange-500" />, color: 'text-orange-500' },
              { label: 'Proteína', value: plan.targetProtein, unit: 'g', icon: <Beef className="w-4 h-4 text-blue-500" />, color: 'text-blue-500' },
              { label: 'Carbohidratos', value: plan.targetCarbs, unit: 'g', icon: <Wheat className="w-4 h-4 text-amber-500" />, color: 'text-amber-500' },
              { label: 'Grasas', value: plan.targetFat, unit: 'g', icon: <Droplets className="w-4 h-4 text-red-400" />, color: 'text-red-400' },
            ].map((m, i) => (
              <div key={i} className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">{m.icon}<span className="text-xs text-slate-400">{m.label}</span></div>
                <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-xs text-slate-400">{m.unit}</p>
              </div>
            ))}
          </div>
          {/* Macro bars */}
          <div className="space-y-2">
            {[
              { label: `Proteína ${macroGoalPercents.protein}%`, pct: macroGoalPercents.protein, color: 'bg-blue-400' },
              { label: `Carbos ${macroGoalPercents.carbs}%`, pct: macroGoalPercents.carbs, color: 'bg-amber-400' },
              { label: `Grasas ${macroGoalPercents.fat}%`, pct: macroGoalPercents.fat, color: 'bg-red-400' },
            ].map(bar => (
              <div key={bar.label} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-24 shrink-0">{bar.label}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${bar.color} rounded-full`} style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Day selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
          {plan.days.map((day, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                selectedDay === i ? 'bg-green-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-green-50'
              }`}
            >
              <Calendar className="w-4 h-4 mb-0.5" />
              {day.dayName}
            </button>
          ))}
        </div>

        {/* Day totals */}
        {currentDay && (
          <>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 grid grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'kcal', value: currentDay.totalCalories, target: plan.targetCalories },
                { label: 'Prot', value: currentDay.totalProtein, target: plan.targetProtein },
                { label: 'Carbs', value: currentDay.totalCarbs, target: plan.targetCarbs },
                { label: 'Grasa', value: currentDay.totalFat, target: plan.targetFat },
              ].map((item, i) => {
                const pct = Math.round((item.value / item.target) * 100);
                const color = pct >= 90 && pct <= 110 ? 'text-green-600' : pct < 80 ? 'text-orange-500' : 'text-red-500';
                return (
                  <div key={i}>
                    <p className={`text-xl font-bold ${color}`}>{item.value}</p>
                    <p className="text-xs text-slate-400">{item.label} <span className="text-xs">({pct}%)</span></p>
                  </div>
                );
              })}
            </div>

            {/* Meals */}
            <div className="space-y-3">
              {currentDay.meals.map((meal, mi) => {
                const recipe = RECIPES_DB.find(r => r.id === meal.recipeId);
                const isExpanded = expandedRecipe === `${selectedDay}-${mi}`;
                return (
                  <div key={mi} className={`bg-white rounded-2xl border ${MEAL_COLORS[meal.mealType] || 'bg-white border-slate-100'} shadow-sm overflow-hidden`}>
                    <button
                      className="w-full flex items-center justify-between p-4"
                      onClick={() => setExpandedRecipe(isExpanded ? null : `${selectedDay}-${mi}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${MEAL_COLORS[meal.mealType]} ${MEAL_TEXT_COLORS[meal.mealType]}`}>
                          {MEAL_LABELS[meal.mealType] || meal.mealType}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-slate-800 text-sm">{meal.recipeName}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-2">
                            <Flame className="w-3 h-3" />{meal.calories} kcal
                            <span>·</span>P: {meal.protein}g
                            <span>·</span>C: {meal.carbs}g
                            <span>·</span>G: {meal.fat}g
                          </p>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>

                    {isExpanded && recipe && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-3 mb-3">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Prep: {recipe.prepTime} min</span>
                          <span className="flex items-center gap-1"><ChefHat className="w-3 h-3" />Cocción: {recipe.cookTime} min</span>
                          <span className={`px-2 py-0.5 rounded-full ${recipe.difficulty === 'easy' ? 'bg-green-100 text-green-600' : recipe.difficulty === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                            {recipe.difficulty === 'easy' ? 'Fácil' : recipe.difficulty === 'medium' ? 'Media' : 'Difícil'}
                          </span>
                        </div>

                        {recipe.ingredients.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">Ingredientes (por ración):</p>
                            <ul className="space-y-0.5">
                              {recipe.ingredients.map((ing, i) => (
                                <li key={i} className="text-xs text-slate-500 flex justify-between">
                                  <span>{ing.foodName}</span>
                                  <span className="text-slate-400">{ing.quantity}g</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {recipe.instructions.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-600 mb-1.5">Preparación:</p>
                            <ol className="space-y-1">
                              {recipe.instructions.map((inst, i) => (
                                <li key={i} className="text-xs text-slate-500 flex gap-2">
                                  <span className="font-semibold text-green-600 shrink-0">{i + 1}.</span>
                                  <span>{inst}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {recipe.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {recipe.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};
