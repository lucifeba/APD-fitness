import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { RECIPES_DB } from '../data/nutrition';
import type { NutritionProfile, NutritionPlan, DayMenu, MealPlan, Recipe } from '../types';
import {
  ChefHat, ChevronRight, ChevronLeft, CheckCircle2,
  Scale, Target, Utensils, Heart, AlertTriangle, Apple, Settings, Calculator,
} from 'lucide-react';

// ── Cálculo de macros ─────────────────────────────────────────────────────────
function calcBMR(weight: number, height: number, age: number, gender: 'male' | 'female'): number {
  // Harris-Benedict revisada (Mifflin-St Jeor)
  if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
  return 10 * weight + 6.25 * height - 5 * age - 161;
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function calcTDEE(bmr: number, activity: keyof typeof ACTIVITY_MULTIPLIERS): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

function calcTargetCalories(tdee: number, goal: string): number {
  if (goal === 'lose_weight') return Math.round(tdee - 400);
  if (goal === 'gain_muscle') return Math.round(tdee + 250);
  if (goal === 'performance') return Math.round(tdee + 100);
  return tdee;
}

function calcMacros(calories: number, weight: number, goal: string) {
  let proteinPerKg = 1.8;
  if (goal === 'gain_muscle') proteinPerKg = 2.2;
  else if (goal === 'lose_weight') proteinPerKg = 2.4;
  else if (goal === 'performance') proteinPerKg = 2.0;

  const protein = Math.round(weight * proteinPerKg);
  const proteinCal = protein * 4;

  const fat = Math.round((calories * 0.25) / 9);
  const fatCal = fat * 9;

  const carbs = Math.round((calories - proteinCal - fatCal) / 4);

  return { protein, fat, carbs };
}

// ── Generación del menú ───────────────────────────────────────────────────────
function filterRecipes(profile: Partial<NutritionProfileForm>, category: Recipe['category']): Recipe[] {
  return RECIPES_DB.filter(r => {
    if (r.category !== category) return false;
    if (!r.dietCompatibility.includes(profile.dietType as any)) return false;
    if (profile.budget === 'low' && r.budget === 'high') return false;
    if (profile.cookingTime === 'minimal' && r.prepTime + r.cookTime > 20) return false;
    return true;
  });
}

function pickRandom<T>(arr: T[], exclude: string[] = []): T | null {
  const filtered = (arr as any[]).filter((r: any) => !exclude.includes(r.id));
  if (filtered.length === 0) return arr[Math.floor(Math.random() * arr.length)] ?? null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function generateDayMenu(
  dayNumber: number,
  dayName: string,
  profile: Partial<NutritionProfileForm>,
  mealsPerDay: number,
  usedRecipes: string[]
): DayMenu {
  const meals: MealPlan[] = [];

  const mealSchedule: MealPlan['mealType'][] =
    mealsPerDay === 3 ? ['breakfast', 'lunch', 'dinner'] :
    mealsPerDay === 4 ? ['breakfast', 'lunch', 'snack', 'dinner'] :
    mealsPerDay === 5 ? ['breakfast', 'mid_morning', 'lunch', 'snack', 'dinner'] :
    mealsPerDay === 6 ? ['breakfast', 'mid_morning', 'pre_workout', 'lunch', 'post_workout', 'dinner'] :
    ['breakfast', 'lunch', 'dinner'];

  const categoryMap: Record<MealPlan['mealType'], Recipe['category']> = {
    breakfast: 'breakfast',
    mid_morning: 'snack',
    lunch: 'lunch',
    snack: 'snack',
    dinner: 'dinner',
    pre_workout: 'pre_workout',
    post_workout: 'post_workout',
    dessert: 'snack',
    protein_shake: 'post_workout',
  };

  mealSchedule.forEach(mealType => {
    const category = categoryMap[mealType];
    const candidates = filterRecipes(profile, category);
    const recipe = pickRandom<Recipe>(candidates, usedRecipes);
    if (recipe) {
      usedRecipes.push(recipe.id);
      meals.push({
        mealType,
        recipeId: recipe.id,
        recipeName: recipe.name,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat,
      });
    }
  });

  const total = meals.reduce((acc, m) => ({
    cal: acc.cal + m.calories,
    pro: acc.pro + m.protein,
    carb: acc.carb + m.carbs,
    fat: acc.fat + m.fat,
  }), { cal: 0, pro: 0, carb: 0, fat: 0 });

  return {
    dayNumber,
    dayName,
    meals,
    totalCalories: total.cal,
    totalProtein: total.pro,
    totalCarbs: total.carb,
    totalFat: total.fat,
  };
}

// ── Tipos del wizard ──────────────────────────────────────────────────────────
interface NutritionProfileForm {
  age: number;
  gender: 'male' | 'female';
  weight: number;
  height: number;
  bodyFat: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose_weight' | 'maintain' | 'gain_muscle' | 'performance' | 'health';
  dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean';
  allergies: string[];
  intolerances: string[];
  mealsPerDay: 2 | 3 | 4 | 5 | 6;
  budget: 'low' | 'medium' | 'high';
  cookingTime: 'minimal' | 'moderate' | 'extensive';
  planName: string;
  weeks: number;
  // Manual macro override
  manualMode: boolean;
  manualCalories: number;
  manualProteinG: number;
  manualCarbsG: number;
  manualFatG: number;
  manualProteinPct: number;
  manualCarbsPct: number;
  manualFatPct: number;
}

const INITIAL: NutritionProfileForm = {
  age: 25,
  gender: 'male',
  weight: 75,
  height: 175,
  bodyFat: 0,
  activityLevel: 'moderate',
  goal: 'maintain',
  dietType: 'mediterranean',
  allergies: [],
  intolerances: [],
  mealsPerDay: 5,
  budget: 'medium',
  cookingTime: 'moderate',
  planName: '',
  weeks: 4,
  manualMode: false,
  manualCalories: 0,
  manualProteinG: 0,
  manualCarbsG: 0,
  manualFatG: 0,
  manualProteinPct: 30,
  manualCarbsPct: 45,
  manualFatPct: 25,
};

const GOAL_LABELS: Record<NutritionProfileForm['goal'], string> = {
  lose_weight: 'Pérdida de Grasa',
  maintain: 'Mantenimiento',
  gain_muscle: 'Ganar Músculo',
  performance: 'Rendimiento Deportivo',
  health: 'Salud General',
};

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ── Componente ────────────────────────────────────────────────────────────────
export const NutritionGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { addNutritionProfile, addNutritionPlan } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<NutritionProfileForm>(INITIAL);
  const [generated, setGenerated] = useState(false);
  const [preview, setPreview] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);

  const totalSteps = 5;

  const update = <K extends keyof NutritionProfileForm>(key: K, value: NutritionProfileForm[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const toggleArray = (key: 'allergies' | 'intolerances', val: string) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter(v => v !== val) : [...f[key], val],
    }));

  // Calculate preview when we reach step 4
  const calcPreview = () => {
    const bmr = calcBMR(form.weight, form.height, form.age, form.gender);
    const tdee = calcTDEE(bmr, form.activityLevel);
    const autoCalories = calcTargetCalories(tdee, form.goal);
    const { protein, fat, carbs } = calcMacros(autoCalories, form.weight, form.goal);
    const initialCalories = form.manualMode && form.manualCalories > 0 ? form.manualCalories : autoCalories;
    // Initialize manual fields from auto calculation if not yet set
    setForm(f => ({
      ...f,
      manualCalories: f.manualCalories > 0 ? f.manualCalories : autoCalories,
      manualProteinG: f.manualProteinG > 0 ? f.manualProteinG : protein,
      manualCarbsG: f.manualCarbsG > 0 ? f.manualCarbsG : carbs,
      manualFatG: f.manualFatG > 0 ? f.manualFatG : fat,
      manualProteinPct: f.manualProteinG > 0 ? f.manualProteinPct : Math.round((protein * 4 / autoCalories) * 100),
      manualCarbsPct: f.manualCarbsG > 0 ? f.manualCarbsPct : Math.round((carbs * 4 / autoCalories) * 100),
      manualFatPct: f.manualFatG > 0 ? f.manualFatPct : Math.round((fat * 9 / autoCalories) * 100),
    }));
    setPreview({ calories: initialCalories, protein, fat, carbs });
  };

  const handleNext = () => {
    if (step === 3) calcPreview();
    setStep(s => s + 1);
  };

  // Manual macro helpers
  const updateManualCalories = (kcal: number) => {
    const p = Math.round((kcal * form.manualProteinPct / 100) / 4);
    const c = Math.round((kcal * form.manualCarbsPct / 100) / 4);
    const f = Math.round((kcal * form.manualFatPct / 100) / 9);
    setForm(prev => ({ ...prev, manualCalories: kcal, manualProteinG: p, manualCarbsG: c, manualFatG: f }));
    setPreview({ calories: kcal, protein: p, carbs: c, fat: f });
  };

  const updateManualGrams = (macro: 'protein' | 'carbs' | 'fat', grams: number) => {
    setForm(prev => {
      const p = macro === 'protein' ? grams : prev.manualProteinG;
      const c = macro === 'carbs' ? grams : prev.manualCarbsG;
      const f = macro === 'fat' ? grams : prev.manualFatG;
      const totalCal = p * 4 + c * 4 + f * 9;
      const pPct = totalCal > 0 ? Math.round((p * 4 / totalCal) * 100) : 0;
      const cPct = totalCal > 0 ? Math.round((c * 4 / totalCal) * 100) : 0;
      const fPct = totalCal > 0 ? Math.round((f * 9 / totalCal) * 100) : 0;
      setPreview({ calories: totalCal, protein: p, carbs: c, fat: f });
      return { ...prev, manualProteinG: p, manualCarbsG: c, manualFatG: f, manualCalories: totalCal, manualProteinPct: pPct, manualCarbsPct: cPct, manualFatPct: fPct };
    });
  };

  const updateManualPct = (macro: 'protein' | 'carbs' | 'fat', pct: number) => {
    setForm(prev => {
      const kcal = prev.manualCalories || 2000;
      const pPct = macro === 'protein' ? pct : prev.manualProteinPct;
      const cPct = macro === 'carbs' ? pct : prev.manualCarbsPct;
      const fPct = macro === 'fat' ? pct : prev.manualFatPct;
      const p = Math.round((kcal * pPct / 100) / 4);
      const c = Math.round((kcal * cPct / 100) / 4);
      const f = Math.round((kcal * fPct / 100) / 9);
      setPreview({ calories: kcal, protein: p, carbs: c, fat: f });
      return { ...prev, manualProteinPct: pPct, manualCarbsPct: cPct, manualFatPct: fPct, manualProteinG: p, manualCarbsG: c, manualFatG: f };
    });
  };

  const handleGenerate = () => {
    const bmr = calcBMR(form.weight, form.height, form.age, form.gender);
    const tdee = calcTDEE(bmr, form.activityLevel);
    const autoCalories = calcTargetCalories(tdee, form.goal);
    const autoMacros = calcMacros(autoCalories, form.weight, form.goal);

    const targetCalories = form.manualMode && form.manualCalories > 0 ? form.manualCalories : autoCalories;
    const protein = form.manualMode && form.manualProteinG > 0 ? form.manualProteinG : autoMacros.protein;
    const fat = form.manualMode && form.manualFatG > 0 ? form.manualFatG : autoMacros.fat;
    const carbs = form.manualMode && form.manualCarbsG > 0 ? form.manualCarbsG : autoMacros.carbs;

    const profile: Omit<NutritionProfile, 'id'> = {
      trainerId: '',
      age: form.age,
      gender: form.gender,
      weight: form.weight,
      height: form.height,
      bodyFat: form.bodyFat || undefined,
      activityLevel: form.activityLevel,
      goal: form.goal,
      dietType: form.dietType,
      allergies: form.allergies,
      intolerances: form.intolerances,
      dislikedFoods: [],
      mealsPerDay: form.mealsPerDay,
      budget: form.budget,
      cookingTime: form.cookingTime,
      tdee,
      targetCalories,
      targetProtein: protein,
      targetCarbs: carbs,
      targetFat: fat,
      createdAt: new Date().toISOString(),
    };

    const savedProfile = addNutritionProfile(profile);

    // Generate 7 days
    const usedRecipes: string[] = [];
    const days: DayMenu[] = DAY_NAMES.map((name, i) =>
      generateDayMenu(i + 1, name, form, form.mealsPerDay, usedRecipes)
    );

    const plan: Omit<NutritionPlan, 'id'> = {
      trainerId: '',
      profileId: savedProfile.id,
      name: form.planName || `Plan ${GOAL_LABELS[form.goal]} - ${form.weeks} semanas`,
      weeks: form.weeks,
      days,
      targetCalories,
      targetProtein: protein,
      targetCarbs: carbs,
      targetFat: fat,
      notes: '',
      createdAt: new Date().toISOString(),
    };

    addNutritionPlan(plan);
    setGenerated(true);
  };

  const canProceed = (): boolean => {
    if (step === 0) return form.age > 0 && form.weight > 0 && form.height > 0;
    if (step === 1) return !!form.activityLevel && !!form.goal;
    return true;
  };

  if (generated) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">¡Plan Nutricional Creado!</h2>
          <p className="text-slate-500 mb-2">Tu plan ha sido generado con recetas típicas españolas adaptadas a tus objetivos.</p>
          {preview && (
            <div className="flex justify-center gap-4 mt-4 mb-6">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{preview.calories}</p>
                <p className="text-xs text-slate-400">kcal/día</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{preview.protein}g</p>
                <p className="text-xs text-slate-400">proteína</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{preview.carbs}g</p>
                <p className="text-xs text-slate-400">carbos</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{preview.fat}g</p>
                <p className="text-xs text-slate-400">grasas</p>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/nutrition')} className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition">
              Ver Planes Nutricionales
            </button>
            <button onClick={() => { setForm(INITIAL); setGenerated(false); setStep(0); setPreview(null); }} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition">
              Crear Otro
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Generador de Plan Nutricional</h1>
              <p className="text-sm text-slate-500">Responde las preguntas para crear tu plan personalizado</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Paso {step + 1} de {totalSteps}</span>
              <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">

          {/* STEP 0: Datos personales */}
          {step === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Scale className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-slate-800">Datos Personales</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Edad</label>
                  <input type="number" value={form.age} min={14} max={80}
                    onChange={e => update('age', Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Género</label>
                  <div className="flex gap-2">
                    {(['male', 'female'] as const).map(g => (
                      <button key={g} onClick={() => update('gender', g)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${form.gender === g ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                        {g === 'male' ? 'Hombre' : 'Mujer'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Peso (kg)</label>
                  <input type="number" value={form.weight} min={30} max={200} step={0.5}
                    onChange={e => update('weight', Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Altura (cm)</label>
                  <input type="number" value={form.height} min={100} max={230}
                    onChange={e => update('height', Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">% Grasa corporal (opcional)</label>
                  <input type="number" value={form.bodyFat || ''} min={3} max={60} step={0.5}
                    onChange={e => update('bodyFat', Number(e.target.value))}
                    placeholder="Ej: 20"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Actividad y objetivo */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Target className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-slate-800">Actividad y Objetivo</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Nivel de actividad física</p>
                  <div className="space-y-2">
                    {([
                      { key: 'sedentary', label: 'Sedentario', desc: 'Trabajo de escritorio, sin deporte' },
                      { key: 'light', label: 'Ligeramente activo', desc: '1-2 días/semana de ejercicio suave' },
                      { key: 'moderate', label: 'Moderadamente activo', desc: '3-4 días/semana de ejercicio moderado' },
                      { key: 'active', label: 'Muy activo', desc: '5-6 días/semana de ejercicio intenso' },
                      { key: 'very_active', label: 'Extremadamente activo', desc: 'Atleta profesional, doble sesión diaria' },
                    ] as { key: NutritionProfileForm['activityLevel']; label: string; desc: string }[]).map(opt => (
                      <button key={opt.key} onClick={() => update('activityLevel', opt.key)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${form.activityLevel === opt.key ? 'border-green-500 bg-green-50' : 'border-slate-100 hover:border-green-200'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.activityLevel === opt.key ? 'border-green-500 bg-green-500' : 'border-slate-300'}`} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                          <p className="text-xs text-slate-400">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Objetivo nutricional</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.entries(GOAL_LABELS) as [NutritionProfileForm['goal'], string][]).map(([key, label]) => (
                      <button key={key} onClick={() => update('goal', key)}
                        className={`p-3 rounded-xl border-2 text-left text-sm transition ${form.goal === key ? 'border-green-500 bg-green-50 text-green-700 font-semibold' : 'border-slate-100 text-slate-600 hover:border-green-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Preferencias dietéticas */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Apple className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-slate-800">Preferencias Alimentarias</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Tipo de alimentación</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {([
                      { key: 'mediterranean', label: 'Mediterránea' },
                      { key: 'omnivore', label: 'Omnívora' },
                      { key: 'vegetarian', label: 'Vegetariana' },
                      { key: 'vegan', label: 'Vegana' },
                      { key: 'pescetarian', label: 'Pescetariana' },
                    ] as { key: NutritionProfileForm['dietType']; label: string }[]).map(opt => (
                      <button key={opt.key} onClick={() => update('dietType', opt.key)}
                        className={`p-3 rounded-xl border-2 text-sm font-medium transition text-center ${form.dietType === opt.key ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-100 text-slate-600 hover:border-green-200'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Alergias (opcional)</p>
                  <div className="flex flex-wrap gap-2">
                    {['Gluten', 'Lactosa', 'Frutos secos', 'Mariscos', 'Huevos', 'Soja'].map(a => (
                      <button key={a} onClick={() => toggleArray('allergies', a)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.allergies.includes(a) ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Intolerancias (opcional)</p>
                  <div className="flex flex-wrap gap-2">
                    {['Lactosa', 'Fructosa', 'Histamina', 'FODMAPs'].map(i => (
                      <button key={i} onClick={() => toggleArray('intolerances', i)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.intolerances.includes(i) ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-orange-50'}`}>
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Logística */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Utensils className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-slate-800">Hábitos y Logística</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Comidas al día: <span className="text-green-600 font-bold">{form.mealsPerDay}</span>
                  </label>
                  <div className="flex gap-2">
                    {([3, 4, 5, 6] as (2 | 3 | 4 | 5 | 6)[]).map(n => (
                      <button key={n} onClick={() => update('mealsPerDay', n)}
                        className={`w-12 h-12 rounded-xl font-semibold text-lg transition ${form.mealsPerDay === n ? 'bg-green-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-green-100'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Presupuesto semanal</p>
                  <div className="flex gap-2">
                    {([
                      { key: 'low', label: 'Ajustado' },
                      { key: 'medium', label: 'Moderado' },
                      { key: 'high', label: 'Sin límite' },
                    ] as { key: NutritionProfileForm['budget']; label: string }[]).map(opt => (
                      <button key={opt.key} onClick={() => update('budget', opt.key)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${form.budget === opt.key ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-green-200'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Tiempo de cocina</p>
                  <div className="flex gap-2">
                    {([
                      { key: 'minimal', label: 'Mínimo (<20 min)' },
                      { key: 'moderate', label: 'Moderado' },
                      { key: 'extensive', label: 'Sin problema' },
                    ] as { key: NutritionProfileForm['cookingTime']; label: string }[]).map(opt => (
                      <button key={opt.key} onClick={() => update('cookingTime', opt.key)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.cookingTime === opt.key ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-green-200'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Duración del plan: <span className="text-green-600 font-bold">{form.weeks} semanas</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[2, 4, 6, 8, 12].map(n => (
                      <button key={n} onClick={() => update('weeks', n)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition ${form.weeks === n ? 'bg-green-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-green-100'}`}>
                        {n} sem
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Resumen y confirmación */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Heart className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-slate-800">Tu Plan Nutricional</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del plan (opcional)</label>
                  <input type="text" value={form.planName}
                    onChange={e => update('planName', e.target.value)}
                    placeholder={`Plan ${GOAL_LABELS[form.goal]}`}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {preview && (
                  <>
                    {/* Auto-calculated summary */}
                    <div className={`rounded-xl p-4 ${form.manualMode ? 'bg-slate-50 border border-slate-200' : 'bg-green-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-green-800">
                          {form.manualMode ? 'Cálculo automático (referencia):' : 'Distribución calórica calculada:'}
                        </p>
                        {!form.manualMode && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <Calculator className="w-3.5 h-3.5" /> Mifflin-St Jeor
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Calorías', value: `${preview.calories} kcal`, color: 'text-slate-800' },
                          { label: 'Proteína', value: `${preview.protein} g`, color: 'text-blue-600' },
                          { label: 'Carbohidratos', value: `${preview.carbs} g`, color: 'text-amber-600' },
                          { label: 'Grasas', value: `${preview.fat} g`, color: 'text-red-500' },
                        ].map(item => (
                          <div key={item.label} className="bg-white rounded-lg p-2.5 text-center shadow-sm">
                            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                            <p className="text-xs text-slate-400">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Manual override toggle */}
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700">Ajuste manual de macros</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => update('manualMode', !form.manualMode)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${form.manualMode ? 'bg-green-500' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.manualMode ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>

                    {/* Manual macro inputs */}
                    {form.manualMode && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
                        <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                          <Settings className="w-4 h-4" /> Ajuste manual de necesidades energéticas
                        </p>

                        {/* Total calories */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Calorías totales (kcal/día)
                          </label>
                          <input
                            type="number"
                            value={form.manualCalories || ''}
                            min={500}
                            max={6000}
                            onChange={e => updateManualCalories(Number(e.target.value))}
                            placeholder="Ej: 2200"
                            className="w-full px-4 py-2.5 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                          />
                        </div>

                        {/* Macros by grams */}
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Por gramos (g/día):</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'protein' as const, label: 'Proteína (g)', color: 'border-blue-300 focus:ring-blue-400', val: form.manualProteinG },
                              { key: 'carbs' as const, label: 'Carbos (g)', color: 'border-amber-300 focus:ring-amber-400', val: form.manualCarbsG },
                              { key: 'fat' as const, label: 'Grasas (g)', color: 'border-red-300 focus:ring-red-400', val: form.manualFatG },
                            ].map(({ key, label, color, val }) => (
                              <div key={key}>
                                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                                <input
                                  type="number"
                                  value={val || ''}
                                  min={0}
                                  max={1000}
                                  onChange={e => updateManualGrams(key, Number(e.target.value))}
                                  className={`w-full px-2 py-2 border ${color} rounded-lg text-sm focus:outline-none focus:ring-2 bg-white`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Macros by percentage */}
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Por porcentaje (%):</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'protein' as const, label: 'Proteína %', color: 'border-blue-300', barColor: 'bg-blue-500', val: form.manualProteinPct },
                              { key: 'carbs' as const, label: 'Carbos %', color: 'border-amber-300', barColor: 'bg-amber-400', val: form.manualCarbsPct },
                              { key: 'fat' as const, label: 'Grasas %', color: 'border-red-300', barColor: 'bg-red-400', val: form.manualFatPct },
                            ].map(({ key, label, color, barColor, val }) => (
                              <div key={key}>
                                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                                <input
                                  type="number"
                                  value={val || ''}
                                  min={0}
                                  max={100}
                                  onChange={e => updateManualPct(key, Number(e.target.value))}
                                  className={`w-full px-2 py-2 border ${color} rounded-lg text-sm focus:outline-none focus:ring-2 bg-white mb-1`}
                                />
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(val, 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          {(form.manualProteinPct + form.manualCarbsPct + form.manualFatPct) !== 100 && (
                            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              La suma de porcentajes es {form.manualProteinPct + form.manualCarbsPct + form.manualFatPct}% (recomendado: 100%)
                            </p>
                          )}
                        </div>

                        {/* Real-time preview of manual values */}
                        <div className="bg-white rounded-xl p-3 border border-blue-200">
                          <p className="text-xs font-semibold text-blue-700 mb-2">Plan configurado:</p>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                              <p className="text-base font-bold text-slate-800">{form.manualCalories}</p>
                              <p className="text-xs text-slate-400">kcal</p>
                            </div>
                            <div>
                              <p className="text-base font-bold text-blue-600">{form.manualProteinG}g</p>
                              <p className="text-xs text-slate-400">prot.</p>
                            </div>
                            <div>
                              <p className="text-base font-bold text-amber-500">{form.manualCarbsG}g</p>
                              <p className="text-xs text-slate-400">carbos</p>
                            </div>
                            <div>
                              <p className="text-base font-bold text-red-500">{form.manualFatG}g</p>
                              <p className="text-xs text-slate-400">grasas</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1.5">
                      <p className="font-semibold text-slate-700 mb-2">Resumen del perfil:</p>
                      <p className="text-slate-600">👤 {form.age} años · {form.gender === 'male' ? 'Hombre' : 'Mujer'} · {form.weight}kg · {form.height}cm</p>
                      <p className="text-slate-600">🎯 Objetivo: <strong>{GOAL_LABELS[form.goal]}</strong></p>
                      <p className="text-slate-600">🥗 Dieta: <strong>{{ omnivore: 'Omnívora', vegetarian: 'Vegetariana', vegan: 'Vegana', pescetarian: 'Pescetariana', mediterranean: 'Mediterránea' }[form.dietType]}</strong></p>
                      <p className="text-slate-600">🍽 Comidas/día: <strong>{form.mealsPerDay}</strong> · Plan: <strong>{form.weeks} semanas</strong></p>
                    </div>
                  </>
                )}

                <div className="flex items-start gap-2.5 bg-amber-50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    Este plan nutricional es una guía basada en cálculos estándar (Mifflin-St Jeor).
                    Consulta con un nutricionista deportivo para una planificación profesional personalizada.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {step < totalSteps - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow transition"
            >
              <ChefHat className="w-4 h-4" /> Generar Plan Nutricional
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
};
