import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { RECIPES_DB } from '../data/nutrition';
import { SPANISH_RECIPES } from '../data/spanishRecipes';
import type { NutritionPlan, NutritionPlanV2, Recipe, SpanishRecipe } from '../types';
import {
  ChevronLeft, Calendar, ChefHat, Clock,
  Flame, Beef, Wheat, Droplets, ChevronDown, ChevronUp,
  Mail, Send, FileDown, Bell, RefreshCw, X, Check,
  CalendarClock, Smartphone, Zap, AlertTriangle, UserCheck,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { differenceInYears } from 'date-fns';

// ── Athlete TDEE calculation ───────────────────────────────────────────────────
function calcAthleteBMR(weight: number, height: number, age: number, gender: 'male' | 'female' | 'other'): number {
  if (gender === 'female') return 10 * weight + 6.25 * height - 5 * age - 161;
  return 10 * weight + 6.25 * height - 5 * age + 5;
}

const LEVEL_MULTIPLIERS: Record<string, number> = {
  beginner: 1.375,
  intermediate: 1.55,
  advanced: 1.725,
  elite: 1.9,
};

function calcAthleteTDEE(athlete: { weight?: number; height?: number; birthDate?: string; gender?: string; level?: string }): number | null {
  if (!athlete.weight || !athlete.height || !athlete.birthDate) return null;
  const age = differenceInYears(new Date(), new Date(athlete.birthDate));
  if (age < 10 || age > 100) return null;
  const bmr = calcAthleteBMR(athlete.weight, athlete.height, age, (athlete.gender as any) || 'male');
  const mult = LEVEL_MULTIPLIERS[athlete.level || 'moderate'] || 1.55;
  return Math.round(bmr * mult);
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  mid_morning: 'Media Mañana',
  lunch: 'Comida',
  snack: 'Merienda',
  dinner: 'Cena',
  pre_workout: 'Pre-Entreno',
  post_workout: 'Post-Entreno',
  dessert: 'Postre',
  protein_shake: 'Batido',
};

const MEAL_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-50 border-amber-200',
  mid_morning: 'bg-green-50 border-green-200',
  lunch: 'bg-blue-50 border-blue-200',
  snack: 'bg-purple-50 border-purple-200',
  dinner: 'bg-indigo-50 border-indigo-200',
  pre_workout: 'bg-orange-50 border-orange-200',
  post_workout: 'bg-teal-50 border-teal-200',
  dessert: 'bg-pink-50 border-pink-200',
  protein_shake: 'bg-teal-50 border-teal-200',
};

const MEAL_TEXT_COLORS: Record<string, string> = {
  breakfast: 'text-amber-700',
  mid_morning: 'text-green-700',
  lunch: 'text-blue-700',
  snack: 'text-purple-700',
  dinner: 'text-indigo-700',
  pre_workout: 'text-orange-700',
  post_workout: 'text-teal-700',
  dessert: 'text-pink-700',
  protein_shake: 'text-teal-700',
};

// ── Recetas: vista común para el recetario V1 y el recetario español (V2) ──────
interface RecipeView {
  id: string;
  name: string;
  category: string;
  prepTime: number;
  cookTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: { name: string; quantity: string }[];
  instructions: string[];
  tags: string[];
}

const viewOfV1 = (r: Recipe): RecipeView => ({
  id: r.id, name: r.name, category: r.category, prepTime: r.prepTime, cookTime: r.cookTime, difficulty: r.difficulty,
  calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat,
  ingredients: r.ingredients.map((i) => ({ name: i.foodName, quantity: `${i.quantity} g` })), instructions: r.instructions, tags: r.tags,
});
const viewOfV2 = (r: SpanishRecipe): RecipeView => ({
  id: r.id, name: r.name, category: r.swapGroup || r.category, prepTime: r.prepTime, cookTime: r.cookTime, difficulty: r.difficulty,
  calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat,
  ingredients: r.ingredients.map((i) => ({ name: i.name + (i.optional ? ' (opcional)' : ''), quantity: i.quantity })), instructions: r.instructions, tags: r.tags,
});

function findRecipe(isV2: boolean, id: string): RecipeView | undefined {
  if (isV2) {
    const r = SPANISH_RECIPES.find((x) => x.id === id);
    return r ? viewOfV2(r) : undefined;
  }
  const r = RECIPES_DB.find((x) => x.id === id);
  return r ? viewOfV1(r) : undefined;
}

// ── Find similar recipes ──────────────────────────────────────────────────────
function findSimilarRecipes(isV2: boolean, recipe: RecipeView, exclude: string[]): RecipeView[] {
  const all: RecipeView[] = isV2 ? SPANISH_RECIPES.map(viewOfV2) : RECIPES_DB.map(viewOfV1);
  const sameSlot = (r: RecipeView) => (isV2 ? r.category === recipe.category || SPANISH_RECIPES.find((x) => x.id === r.id)?.category === SPANISH_RECIPES.find((x) => x.id === recipe.id)?.category : r.category === recipe.category);
  return all
    .filter((r) => r.id !== recipe.id && !exclude.includes(r.id) && sameSlot(r))
    .sort((a, b) => {
      // Score by macro similarity
      const scoreA = Math.abs(a.calories - recipe.calories) + Math.abs(a.protein - recipe.protein) * 2;
      const scoreB = Math.abs(b.calories - recipe.calories) + Math.abs(b.protein - recipe.protein) * 2;
      return scoreA - scoreB;
    })
    .slice(0, 6);
}

/** Plan unificado: los planes V1 y V2 comparten días, objetivos y deportista. */
type AnyPlan = (NutritionPlan & { isV2: false; weeks: number }) | (NutritionPlanV2 & { isV2: true; weeks: number });

// ── Export PDF ────────────────────────────────────────────────────────────────
function exportPDF(plan: AnyPlan | null) {
  if (!plan) return;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(30, 80, 200);
  doc.text(plan.name, 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(`${plan.days.length} días · ${plan.weeks} semanas`, 14, 28);
  doc.text(`Objetivos: ${plan.targetCalories} kcal | P: ${plan.targetProtein}g | C: ${plan.targetCarbs}g | G: ${plan.targetFat}g`, 14, 35);

  let y = 45;
  plan.days.forEach((day) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setTextColor(30, 80, 200);
    doc.text(`${day.dayName}`, 14, y);
    y += 6;
    day.meals.forEach((meal) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const label = MEAL_LABELS[meal.mealType] || meal.mealType;
      doc.text(`  ${label}: ${meal.recipeName} — ${meal.calories} kcal | P: ${meal.protein}g | C: ${meal.carbs}g | G: ${meal.fat}g`, 14, y);
      y += 5;
    });
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`  Total: ${day.totalCalories} kcal | P: ${day.totalProtein}g | C: ${day.totalCarbs}g | G: ${day.totalFat}g`, 14, y);
    y += 8;
  });

  doc.save(`${plan.name.replace(/\s+/g, '_')}.pdf`);
}

export const NutritionPlanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { nutritionPlans, nutritionPlansV2, currentUser, athletes, updateNutritionPlan, updateNutritionPlanV2, addNotification, scheduleNutritionSend, scheduledSends, cancelScheduledSend } = useStore();
  const [selectedDay, setSelectedDay] = useState(0);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);

  // Swap state
  const [swapTarget, setSwapTarget] = useState<{ dayIdx: number; mealIdx: number } | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<RecipeView[]>([]);

  // Action panel
  const [showActions, setShowActions] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleVia, setScheduleVia] = useState<('email' | 'app')[]>(['app']);
  const [emailAddress, setEmailAddress] = useState('');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [adjustingToAthlete, setAdjustingToAthlete] = useState(false);

  const v1 = nutritionPlans.find((p) => p.id === id);
  const v2 = v1 ? undefined : nutritionPlansV2.find((p) => p.id === id);
  const plan: AnyPlan | null = v1 ? { ...v1, isV2: false } : v2 ? { ...v2, isV2: true, weeks: v2.weekCount } : null;
  /** Guarda cambios en el plan, sea V1 o V2. */
  const savePlan = (data: { days?: AnyPlan['days']; targetCalories?: number; targetProtein?: number; targetCarbs?: number; targetFat?: number }) => {
    if (!plan) return;
    if (plan.isV2) updateNutritionPlanV2(plan.id, data);
    else updateNutritionPlan(plan.id, data);
  };

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

  // Linked athlete
  const athlete = athletes.find(a => a.id === plan.athleteId);

  // Athlete TDEE calculation
  const athleteTDEE = athlete ? calcAthleteTDEE(athlete) : null;
  const calorieDiff = athleteTDEE ? Math.abs(athleteTDEE - plan.targetCalories) : 0;
  const needsAdjustment = athleteTDEE !== null && calorieDiff > 100;

  // ── ADJUST TO ATHLETE ENERGY NEEDS ────────────────────────────────────────
  const handleAdjustToAthlete = () => {
    if (!athleteTDEE || !athlete) return;
    setAdjustingToAthlete(true);

    // Keep macro % ratios but scale to athlete TDEE
    const proteinPct = macroGoalPercents.protein / 100;
    const carbsPct = macroGoalPercents.carbs / 100;
    const fatPct = macroGoalPercents.fat / 100;

    const newProtein = Math.round((athleteTDEE * proteinPct) / 4);
    const newCarbs = Math.round((athleteTDEE * carbsPct) / 4);
    const newFat = Math.round((athleteTDEE * fatPct) / 9);

    savePlan({
      targetCalories: athleteTDEE,
      targetProtein: newProtein,
      targetCarbs: newCarbs,
      targetFat: newFat,
    });

    setTimeout(() => {
      setAdjustingToAthlete(false);
      setActionStatus(`Plan ajustado a las necesidades de ${athlete.name}: ${athleteTDEE} kcal`);
      setTimeout(() => setActionStatus(null), 4000);
    }, 400);
  };

  // Scheduled sends for this plan
  const myScheduled = scheduledSends.filter(s => s.nutritionPlanId === plan.id && !s.sent);

  // ── SWAP MEAL ────────────────────────────────────────────────────────────────
  const handleOpenSwap = (dayIdx: number, mealIdx: number) => {
    const meal = plan.days[dayIdx].meals[mealIdx];
    const recipe = findRecipe(plan.isV2, meal.recipeId);
    if (!recipe) return;
    const others = plan.days[dayIdx].meals.map(m => m.recipeId);
    setSwapCandidates(findSimilarRecipes(plan.isV2, recipe, others));
    setSwapTarget({ dayIdx, mealIdx });
  };

  const handleConfirmSwap = (newRecipe: RecipeView) => {
    if (!swapTarget) return;
    const { dayIdx, mealIdx } = swapTarget;
    const updatedDays = plan.days.map((day, di) => {
      if (di !== dayIdx) return day;
      const updatedMeals = day.meals.map((meal, mi) => {
        if (mi !== mealIdx) return meal;
        // Adjust quantity proportionally to match original calories
        const originalCal = meal.calories;
        const factor = newRecipe.calories > 0 ? originalCal / newRecipe.calories : 1;
        return {
          ...meal,
          recipeId: newRecipe.id,
          recipeName: newRecipe.name,
          calories: Math.round(newRecipe.calories * factor),
          protein: Math.round(newRecipe.protein * factor),
          carbs: Math.round(newRecipe.carbs * factor),
          fat: Math.round(newRecipe.fat * factor),
        };
      });
      const totalCalories = updatedMeals.reduce((s, m) => s + m.calories, 0);
      const totalProtein = updatedMeals.reduce((s, m) => s + m.protein, 0);
      const totalCarbs = updatedMeals.reduce((s, m) => s + m.carbs, 0);
      const totalFat = updatedMeals.reduce((s, m) => s + m.fat, 0);
      return { ...day, meals: updatedMeals, totalCalories, totalProtein, totalCarbs, totalFat };
    });
    savePlan({ days: updatedDays });
    setSwapTarget(null);
    setActionStatus('Plato intercambiado correctamente');
    setTimeout(() => setActionStatus(null), 3000);
  };

  // ── SEND TO APP ──────────────────────────────────────────────────────────────
  const handleSendToApp = () => {
    if (!athlete) return;
    addNotification({
      recipientId: athlete.id,
      senderId: currentUser?.id || '',
      senderName: currentUser?.name || 'Entrenador',
      type: 'nutrition_sent',
      title: 'Nuevo Plan Nutricional',
      body: `Tu entrenador te ha enviado el plan: ${plan.name}`,
      link: `/nutrition/plan/${plan.id}`,
    });
    // Also notify trainer confirmation
    addNotification({
      recipientId: currentUser?.id || '',
      senderId: currentUser?.id || '',
      senderName: 'Sistema',
      type: 'system',
      title: 'Plan enviado',
      body: `El plan "${plan.name}" fue enviado a ${athlete.name}`,
    });
    setActionStatus(`Plan enviado a ${athlete.name} en la app`);
    setTimeout(() => setActionStatus(null), 3000);
  };

  // ── SEND EMAIL ────────────────────────────────────────────────────────────────
  const handleSendEmail = () => {
    const target = emailAddress || athlete?.email;
    if (!target) { setActionStatus('Error: no hay dirección de correo'); return; }
    // In production use EmailJS — here open mailto as fallback
    const subject = encodeURIComponent(`Plan Nutricional: ${plan.name}`);
    const body = encodeURIComponent(
      `Hola,\n\nTe adjunto tu plan nutricional "${plan.name}".\n\nObjetivos diarios:\n` +
      `- Calorías: ${plan.targetCalories} kcal\n- Proteínas: ${plan.targetProtein}g\n` +
      `- Carbohidratos: ${plan.targetCarbs}g\n- Grasas: ${plan.targetFat}g\n\n` +
      `Días incluidos:\n` + plan.days.map(d => `${d.dayName}: ${d.totalCalories} kcal`).join('\n') +
      `\n\nSaludos,\n${currentUser?.name}`
    );
    window.open(`mailto:${target}?subject=${subject}&body=${body}`);
    setActionStatus(`Correo abierto para ${target}`);
    setTimeout(() => setActionStatus(null), 3000);
  };

  // ── SCHEDULE SEND ────────────────────────────────────────────────────────────
  const handleSchedule = () => {
    if (!scheduleDate || !plan.athleteId) return;
    scheduleNutritionSend({
      nutritionPlanId: plan.id,
      athleteId: plan.athleteId,
      trainerId: currentUser?.id || '',
      scheduledDate: scheduleDate,
      sendVia: scheduleVia,
    });
    setShowSchedule(false);
    setScheduleDate('');
    setActionStatus('Envío programado correctamente');
    setTimeout(() => setActionStatus(null), 3000);
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
            <p className="text-sm text-slate-400">{plan.days.length} días · {plan.weeks} semanas {athlete ? `· ${athlete.name}` : ''}</p>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportPDF(plan)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl transition"
              title="Exportar PDF"
            >
              <FileDown className="w-4 h-4" /> PDF
            </button>
            <button
              onClick={() => setShowActions((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white hover:bg-green-700 rounded-xl transition"
            >
              <Send className="w-4 h-4" /> Enviar
            </button>
          </div>
        </div>

        {/* Action status toast */}
        {actionStatus && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm">
            <Check className="w-4 h-4" /> {actionStatus}
          </div>
        )}

        {/* Action panel */}
        {showActions && (
          <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-sm">Opciones de Envío</h3>
              <button onClick={() => setShowActions(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {/* Send to app */}
              <button
                onClick={handleSendToApp}
                disabled={!athlete}
                className="flex flex-col items-center gap-2 p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Smartphone className="w-6 h-6 text-blue-600" />
                <span className="text-xs font-medium text-slate-700">Enviar a App</span>
                <span className="text-xs text-slate-400">{athlete ? athlete.name : 'Sin deportista'}</span>
              </button>

              {/* Send email */}
              <div className="flex flex-col gap-2 p-4 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <Mail className="w-5 h-5 text-emerald-600" /> Enviar por Email
                </div>
                <input
                  type="email"
                  placeholder={athlete?.email || 'correo@ejemplo.com'}
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  onClick={handleSendEmail}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition"
                >
                  Enviar Email
                </button>
              </div>

              {/* Schedule */}
              <div className="flex flex-col gap-2 p-4 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <CalendarClock className="w-5 h-5 text-purple-600" /> Programar Envío
                </div>
                <input
                  type="date"
                  value={scheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <div className="flex gap-2">
                  {(['app', 'email'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleVia.includes(v)}
                        onChange={(e) => setScheduleVia(prev =>
                          e.target.checked ? [...prev, v] : prev.filter(x => x !== v)
                        )}
                        className="accent-purple-600"
                      />
                      {v === 'app' ? 'App' : 'Email'}
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleSchedule}
                  disabled={!scheduleDate || !plan.athleteId}
                  className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Programar
                </button>
              </div>
            </div>

            {/* Scheduled sends list */}
            {myScheduled.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Envíos programados</p>
                <div className="space-y-1.5">
                  {myScheduled.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                      <span className="text-slate-700">
                        📅 {new Date(s.scheduledDate).toLocaleDateString('es-ES')} — vía: {s.sendVia.join(', ')}
                      </span>
                      <button onClick={() => cancelScheduledSend(s.id)} className="text-red-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Athlete energy needs banner */}
        {athlete && athleteTDEE && needsAdjustment && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Desajuste energético detectado</p>
              <p className="text-xs text-amber-700 mt-0.5">
                El plan tiene <strong>{plan.targetCalories} kcal</strong>, pero las necesidades energéticas calculadas de <strong>{athlete.name}</strong> son <strong>{athleteTDEE} kcal</strong> (diferencia: {calorieDiff > 0 ? '+' : ''}{plan.targetCalories - athleteTDEE} kcal).
              </p>
              {athlete.weight && athlete.height && athlete.birthDate ? null : (
                <p className="text-xs text-amber-600 mt-1">Datos insuficientes del deportista para cálculo completo (se necesita peso, talla y fecha de nacimiento).</p>
              )}
            </div>
            <button
              onClick={handleAdjustToAthlete}
              disabled={adjustingToAthlete}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-xl hover:bg-amber-600 transition disabled:opacity-60 shrink-0"
            >
              <Zap className="w-3.5 h-3.5" />
              {adjustingToAthlete ? 'Ajustando...' : 'Ajustar al Deportista'}
            </button>
          </div>
        )}

        {/* Athlete energy info (no adjustment needed) */}
        {athlete && athleteTDEE && !needsAdjustment && (
          <div className="mb-5 bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-xs text-green-700">
              Plan ajustado correctamente a las necesidades de <strong>{athlete.name}</strong> ({athleteTDEE} kcal estimadas · diferencia ≤ 100 kcal).
            </p>
          </div>
        )}

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

        {/* Notas e instrucciones del plan (V2) */}
        {plan.isV2 && (plan.notes || plan.context?.patientDescription) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 text-sm text-slate-600 space-y-1.5">
            {plan.context?.patientDescription && <p><span className="font-semibold text-slate-700">Paciente:</span> {plan.context.patientDescription}</p>}
            {plan.notes && plan.notes.split('\n').map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}

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
            {currentDay.notes && (
              <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-xs">
                <Zap className="w-3.5 h-3.5 shrink-0" /> {currentDay.notes}
              </div>
            )}
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
                const recipe = findRecipe(plan.isV2, meal.recipeId);
                const isExpanded = expandedRecipe === `${selectedDay}-${mi}`;
                return (
                  <div key={mi} className={`bg-white rounded-2xl border ${MEAL_COLORS[meal.mealType] || 'bg-white border-slate-100'} shadow-sm overflow-hidden`}>
                    <div className="flex items-center justify-between p-4">
                      <button
                        className="flex items-center gap-3 flex-1 text-left"
                        onClick={() => setExpandedRecipe(isExpanded ? null : `${selectedDay}-${mi}`)}
                      >
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
                      </button>
                      <div className="flex items-center gap-1.5 ml-2">
                        <button
                          onClick={() => handleOpenSwap(selectedDay, mi)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Intercambiar plato"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setExpandedRecipe(isExpanded ? null : `${selectedDay}-${mi}`)}>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                      </div>
                    </div>

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
                                <li key={i} className="text-xs text-slate-500 flex justify-between gap-3">
                                  <span>{ing.name}</span>
                                  <span className="text-slate-400 text-right">{ing.quantity}</span>
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

        {/* Swap modal */}
        {swapTarget && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSwapTarget(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h3 className="font-semibold text-slate-800">Intercambiar Plato</h3>
                  <p className="text-xs text-slate-400">Alternativas similares con macros ajustados</p>
                </div>
                <button onClick={() => setSwapTarget(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                {swapCandidates.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No hay alternativas disponibles para este tipo de comida</p>
                ) : swapCandidates.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleConfirmSwap(r)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition"
                  >
                    <p className="font-medium text-slate-800 text-sm">{r.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.calories} kcal · P: {r.protein}g · C: {r.carbs}g · G: {r.fat}g
                      <span className="ml-2 text-slate-300">·</span>
                      <span className="ml-1">{r.prepTime + r.cookTime} min</span>
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.tags.slice(0, 3).map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">{t}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
