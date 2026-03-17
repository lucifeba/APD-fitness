import React, { useState } from 'react';
import { AthleteLayout } from './AthleteLayout';
import { useStore } from '../../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Apple, ChevronRight, Flame, Beef, Wheat, Droplets, ChefHat, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { RECIPES_DB } from '../../data/nutrition';

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Desayuno', mid_morning: 'Media Mañana', lunch: 'Comida',
  snack: 'Merienda', dinner: 'Cena', pre_workout: 'Pre-Entreno', post_workout: 'Post-Entreno',
};
const MEAL_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-50 border-amber-200', mid_morning: 'bg-green-50 border-green-200',
  lunch: 'bg-blue-50 border-blue-200', snack: 'bg-purple-50 border-purple-200',
  dinner: 'bg-indigo-50 border-indigo-200', pre_workout: 'bg-orange-50 border-orange-200',
  post_workout: 'bg-teal-50 border-teal-200',
};

export const AthleteMyNutrition: React.FC = () => {
  const { currentUser, athletes, nutritionPlans } = useStore();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);

  const athleteRecord = athletes.find((a) => a.email === currentUser?.email);
  const myPlans = nutritionPlans.filter((np) => np.athleteId === athleteRecord?.id);

  const plan = myPlans.find((p) => p.id === selectedPlan) || myPlans[myPlans.length - 1];

  return (
    <AthleteLayout title="Mi Plan Nutricional" subtitle="Consulta tu alimentación diaria">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {myPlans.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Apple className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aún no tienes plan nutricional</p>
            <p className="text-sm mt-1">Tu entrenador te asignará un plan pronto</p>
          </div>
        ) : (
          <>
            {/* Plan selector */}
            {myPlans.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
                {myPlans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlan(p.id); setSelectedDay(0); }}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition ${
                      plan?.id === p.id ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {plan && (
              <>
                {/* Macro targets */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">Objetivos Diarios</h2>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { label: 'Calorías', value: plan.targetCalories, unit: 'kcal', color: 'text-orange-500' },
                      { label: 'Proteína', value: plan.targetProtein, unit: 'g', color: 'text-blue-500' },
                      { label: 'Carbos', value: plan.targetCarbs, unit: 'g', color: 'text-amber-500' },
                      { label: 'Grasas', value: plan.targetFat, unit: 'g', color: 'text-red-400' },
                    ].map((m, i) => (
                      <div key={i}>
                        <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                        <p className="text-xs text-slate-400">{m.label} ({m.unit})</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day selector */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {plan.days.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(i)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                        selectedDay === i ? 'bg-green-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {day.dayName}
                    </button>
                  ))}
                </div>

                {/* Day meals */}
                {plan.days[selectedDay] && (
                  <div className="space-y-3">
                    {plan.days[selectedDay].meals.map((meal, mi) => {
                      const recipe = RECIPES_DB.find((r) => r.id === meal.recipeId);
                      const isExp = expandedMeal === `${selectedDay}-${mi}`;
                      return (
                        <div key={mi} className={`bg-white rounded-2xl border ${MEAL_COLORS[meal.mealType] || 'border-slate-100'} shadow-sm overflow-hidden`}>
                          <button
                            className="w-full flex items-center justify-between p-4"
                            onClick={() => setExpandedMeal(isExp ? null : `${selectedDay}-${mi}`)}
                          >
                            <div className="flex items-center gap-3 text-left">
                              <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${MEAL_COLORS[meal.mealType]}`}>
                                {MEAL_LABELS[meal.mealType] || meal.mealType}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800 text-sm">{meal.recipeName}</p>
                                <p className="text-xs text-slate-400">
                                  <Flame className="inline w-3 h-3 mr-0.5" />{meal.calories} kcal · P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g
                                </p>
                              </div>
                            </div>
                            {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </button>

                          {isExp && recipe && (
                            <div className="px-4 pb-4 border-t border-slate-100">
                              <div className="flex gap-3 text-xs text-slate-400 my-3">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Prep: {recipe.prepTime}min</span>
                                <span className="flex items-center gap-1"><ChefHat className="w-3 h-3" />Cocción: {recipe.cookTime}min</span>
                              </div>
                              {recipe.ingredients.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Ingredientes:</p>
                                  <ul className="space-y-0.5">
                                    {recipe.ingredients.map((ing, i) => (
                                      <li key={i} className="text-xs text-slate-500 flex justify-between">
                                        <span>{ing.foodName}</span><span className="text-slate-400">{ing.quantity}g</span>
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
                                        <span className="font-semibold text-green-600 shrink-0">{i+1}.</span>{inst}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AthleteLayout>
  );
};
