import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { SPANISH_RECIPES } from '../data/spanishRecipes';
import type {
  NutritionistContext, NutritionPlanV2, SDietType, SAllergen,
  SIntolerance, SPathology, SpanishRecipe, MealPlan, DayMenu,
} from '../types';
import {
  ArrowLeft, ArrowRight, User, Apple, Settings2, Sparkles,
  Check, ChefHat, AlertTriangle, Coffee, Milk, Cake, Dumbbell,
  Calendar, Scale, Ruler, Activity,
} from 'lucide-react';

const STEPS = ['Paciente', 'Dieta', 'Preferencias', 'Generar Plan'] as const;

const DIET_LABELS: Record<SDietType, string> = {
  omnivore: 'Omnívora', vegetarian: 'Vegetariana', vegan: 'Vegana',
  pescetarian: 'Pescetariana', mediterranean: 'Mediterránea',
};
const ALLERGEN_LABELS: Record<SAllergen, string> = {
  gluten: 'Gluten', lactosa: 'Lactosa', huevos: 'Huevos', frutos_secos: 'Frutos Secos',
  pescado: 'Pescado', mariscos: 'Mariscos', soja: 'Soja', sesamo: 'Sésamo',
  mostaza: 'Mostaza', apio: 'Apio',
};
const INTOLERANCE_LABELS: Record<SIntolerance, string> = {
  lactosa: 'Lactosa', fructosa: 'Fructosa', histamina: 'Histamina', fodmap: 'FODMAP',
  sorbitol: 'Sorbitol', sulfitos: 'Sulfitos', cafeina: 'Cafeína', salicilatos: 'Salicilatos',
  oxalatos: 'Oxalatos', polioles: 'Polioles', gluten: 'Gluten', solanaceas: 'Solanáceas',
};
const PATHOLOGY_LABELS: Record<SPathology, string> = {
  diabetes_t2: 'Diabetes T2', hipertension: 'Hipertensión', hipotiroidismo: 'Hipotiroidismo',
  anemia: 'Anemia', osteoporosis: 'Osteoporosis', celiaquía: 'Celiaquía', crohn: 'Crohn',
  colon_irritable: 'Colon Irritable', reflujo: 'Reflujo', colesterol_alto: 'Colesterol Alto',
  gota: 'Gota', insuf_renal: 'Insuf. Renal', higado_graso: 'Hígado Graso',
  hipoglucemia: 'Hipoglucemia', hiperuricemia: 'Hiperuricemia', artritis: 'Artritis', sibo: 'SIBO',
};
const GOAL_OPTIONS = [
  { value: 'lose_weight', label: 'Pérdida de peso', desc: 'Déficit calórico moderado' },
  { value: 'maintain', label: 'Mantenimiento', desc: 'Equilibrio calórico' },
  { value: 'gain_muscle', label: 'Ganar músculo', desc: 'Superávit controlado' },
  { value: 'performance', label: 'Rendimiento deportivo', desc: 'Timing nutricional' },
  { value: 'health', label: 'Salud general', desc: 'Alimentación equilibrada' },
];
const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentario', factor: 1.2 },
  { value: 'light', label: 'Ligero (1-3 días/sem)', factor: 1.375 },
  { value: 'moderate', label: 'Moderado (3-5 días/sem)', factor: 1.55 },
  { value: 'active', label: 'Activo (6-7 días/sem)', factor: 1.725 },
  { value: 'very_active', label: 'Muy activo (2x día)', factor: 1.9 },
];

function calcTDEE(gender: 'male' | 'female', weight: number, height: number, age: number, activityFactor: number): number {
  const bmr = gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  return Math.round(bmr * activityFactor);
}

function adjustCalories(tdee: number, goal: string): number {
  switch (goal) {
    case 'lose_weight': return Math.round(tdee - 400);
    case 'gain_muscle': return Math.round(tdee + 250);
    case 'performance': return Math.round(tdee + 150);
    default: return tdee;
  }
}

function calcMacros(calories: number, goal: string, weight: number) {
  let proteinPerKg = 1.8;
  if (goal === 'gain_muscle') proteinPerKg = 2.2;
  if (goal === 'lose_weight') proteinPerKg = 2.0;
  if (goal === 'performance') proteinPerKg = 2.0;
  const protein = Math.round(weight * proteinPerKg);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { protein, fat, carbs };
}

function filterRecipes(
  recipes: SpanishRecipe[],
  ctx: NutritionistContext,
): SpanishRecipe[] {
  return recipes.filter(r => {
    if (ctx.dietType !== 'omnivore' && !r.dietTypes.includes(ctx.dietType)) return false;
    if (ctx.allergies.some(a => r.allergens.includes(a))) return false;
    if (ctx.intolerances.some(i => r.intolerances.includes(i))) return false;
    if (ctx.pathologies.some(p => r.pathologyContraindications.includes(p))) return false;
    if (ctx.budget !== 'high' && r.budget === 'high' && ctx.budget === 'low') return false;
    return true;
  });
}

function pickRecipe(
  pool: SpanishRecipe[],
  category: string,
  usedToday: Set<string>,
  usedYesterday: Set<string>,
  targetCal: number,
): SpanishRecipe | null {
  const candidates = pool
    .filter(r => r.category === category)
    .filter(r => !usedToday.has(r.id))
    .filter(r => !usedYesterday.has(r.id));
  if (candidates.length === 0) {
    const fallback = pool.filter(r => r.category === category).filter(r => !usedToday.has(r.id));
    if (fallback.length === 0) return pool.find(r => r.category === category) || null;
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
  candidates.sort((a, b) => Math.abs(a.calories - targetCal) - Math.abs(b.calories - targetCal));
  const top = candidates.slice(0, Math.min(5, candidates.length));
  return top[Math.floor(Math.random() * top.length)];
}

function generatePlan(
  ctx: NutritionistContext,
  targetCalories: number,
  targetProtein: number,
  targetCarbs: number,
  targetFat: number,
  weekCount: number,
  mode: 'weeks' | 'blocks',
): DayMenu[] {
  const eligible = filterRecipes(SPANISH_RECIPES, ctx);
  const totalDays = weekCount * 7;
  const days: DayMenu[] = [];
  const calPerMeal: Record<string, number> = {
    breakfast: targetCalories * 0.2,
    mid_morning: targetCalories * 0.1,
    lunch: targetCalories * 0.35,
    snack: targetCalories * 0.1,
    dinner: targetCalories * 0.25,
  };
  const mealTypes: Array<MealPlan['mealType']> = ['breakfast', 'mid_morning', 'lunch', 'snack', 'dinner'];
  if (ctx.includeDessertLunch) mealTypes.push('dessert');
  if (ctx.includeProteinShakes) mealTypes.push('protein_shake');

  let prevDayIds = new Set<string>();

  for (let d = 0; d < totalDays; d++) {
    const todayIds = new Set<string>();
    const meals: MealPlan[] = [];
    for (const mt of mealTypes) {
      let cat = mt as string;
      if (cat === 'dessert') cat = 'snack';
      if (cat === 'protein_shake') cat = 'snack';
      if (cat === 'pre_workout' || cat === 'post_workout') cat = 'snack';
      const target = calPerMeal[cat] || targetCalories * 0.1;
      const recipe = pickRecipe(eligible, cat, todayIds, prevDayIds, target);
      if (recipe) {
        todayIds.add(recipe.id);
        meals.push({
          mealType: mt,
          recipeId: recipe.id,
          recipeName: recipe.name,
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fat: recipe.fat,
        });
      }
    }
    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    days.push({
      dayNumber: d + 1,
      dayName: dayNames[d % 7],
      weekNumber: Math.floor(d / 7) + 1,
      meals,
      totalCalories: meals.reduce((s, m) => s + m.calories, 0),
      totalProtein: meals.reduce((s, m) => s + m.protein, 0),
      totalCarbs: meals.reduce((s, m) => s + m.carbs, 0),
      totalFat: meals.reduce((s, m) => s + m.fat, 0),
    });
    prevDayIds = todayIds;
  }
  return days;
}

export const NutritionPlanWizard: React.FC = () => {
  const navigate = useNavigate();
  const { addNutritionPlanV2, currentUser } = useStore();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);

  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(30);
  const [weight, setWeight] = useState(75);
  const [height, setHeight] = useState(175);
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [planName, setPlanName] = useState('');
  const [weekCount, setWeekCount] = useState(1);
  const [mode, setMode] = useState<'weeks' | 'blocks'>('weeks');

  const [ctx, setCtx] = useState<NutritionistContext>({
    patientDescription: '', goal: 'maintain', dietType: 'omnivore',
    allergies: [], intolerances: [], pathologies: [], mealsPerDay: 5,
    specificRestrictions: '', specificInstructions: '',
    includeCoffee: true, milkType: 'dairy',
    includeDessertLunch: false, includeDessertDinner: false, dessertTypes: [],
    includeProteinShakes: false, proteinShakeDays: 3,
    isPreCompetition: false, competitionDate: '',
    budget: 'medium', cookingTime: 'moderate',
  });

  const actFactor = ACTIVITY_LEVELS.find(a => a.value === activityLevel)?.factor || 1.55;
  const tdee = calcTDEE(gender, weight, height, age, actFactor);
  const targetCalories = adjustCalories(tdee, ctx.goal);
  const macros = calcMacros(targetCalories, ctx.goal, weight);

  const toggleArray = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const days = generatePlan(ctx, targetCalories, macros.protein, macros.carbs, macros.fat, weekCount, mode);
      const plan: NutritionPlanV2 = {
        id: `npv2_${Date.now()}`,
        trainerId: currentUser?.id || 'trainer1',
        name: planName || `Plan ${new Date().toLocaleDateString('es-ES')}`,
        mode, weekCount, blockSize: mode === 'blocks' ? 14 : 7,
        days,
        targetCalories, targetProtein: macros.protein,
        targetCarbs: macros.carbs, targetFat: macros.fat,
        context: ctx, createdAt: new Date().toISOString(),
        age, gender, weight, height, activityLevel,
      };
      addNutritionPlanV2(plan);
      setGenerating(false);
      navigate(`/nutrition/plan/${plan.id}`);
    }, 1500);
  };

  const eligible = filterRecipes(SPANISH_RECIPES, ctx);

  const Chip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        active ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >{label}</button>
  );

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/nutrition')} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Asistente Nutricional</h1>
            <p className="text-xs text-slate-400">Paso {step + 1} de {STEPS.length}: {STEPS[step]}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-green-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Step 0: Patient */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-green-500" /> Datos del Paciente
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Sexo</label>
                  <div className="flex gap-2">
                    {(['male', 'female'] as const).map(g => (
                      <button key={g} onClick={() => setGender(g)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition border ${gender === g ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {g === 'male' ? 'Hombre' : 'Mujer'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block"><Calendar className="w-3 h-3 inline" /> Edad</label>
                  <input type="number" value={age} onChange={e => setAge(+e.target.value)} min={10} max={100}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block"><Scale className="w-3 h-3 inline" /> Peso (kg)</label>
                  <input type="number" value={weight} onChange={e => setWeight(+e.target.value)} min={30} max={250}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block"><Ruler className="w-3 h-3 inline" /> Altura (cm)</label>
                  <input type="number" value={height} onChange={e => setHeight(+e.target.value)} min={100} max={230}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-slate-500 mb-1 block"><Activity className="w-3 h-3 inline" /> Nivel de Actividad</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ACTIVITY_LEVELS.map(al => (
                    <button key={al.value} onClick={() => setActivityLevel(al.value)}
                      className={`p-3 rounded-xl text-left border transition ${activityLevel === al.value ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <span className="text-xs font-medium text-slate-700">{al.label}</span>
                      <span className="block text-xs text-slate-400 mt-0.5">Factor: {al.factor}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 p-4 bg-green-50 rounded-xl">
                <p className="text-sm text-green-800 font-medium">TDEE estimado: <span className="text-lg font-bold">{tdee} kcal/día</span></p>
                <p className="text-xs text-green-600 mt-1">Mifflin-St Jeor × Factor de actividad</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Objetivo</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button key={g.value} onClick={() => setCtx({ ...ctx, goal: g.value })}
                    className={`p-4 rounded-xl text-left border transition ${ctx.goal === g.value ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <span className="text-sm font-medium text-slate-700">{g.label}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">{g.desc}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded-xl grid grid-cols-3 gap-4 text-center">
                <div><p className="text-xs text-blue-500">Calorías</p><p className="text-lg font-bold text-blue-800">{targetCalories}</p></div>
                <div><p className="text-xs text-blue-500">Proteína</p><p className="text-lg font-bold text-blue-800">{macros.protein}g</p></div>
                <div><p className="text-xs text-blue-500">Carbos / Grasa</p><p className="text-lg font-bold text-blue-800">{macros.carbs}g / {macros.fat}g</p></div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Diet */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                <Apple className="w-5 h-5 text-green-500" /> Tipo de Dieta
              </h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DIET_LABELS) as SDietType[]).map(dt => (
                  <Chip key={dt} active={ctx.dietType === dt} label={DIET_LABELS[dt]}
                    onClick={() => setCtx({ ...ctx, dietType: dt })} />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Alergias Alimentarias
              </h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ALLERGEN_LABELS) as SAllergen[]).map(a => (
                  <Chip key={a} active={ctx.allergies.includes(a)} label={ALLERGEN_LABELS[a]}
                    onClick={() => setCtx({ ...ctx, allergies: toggleArray(ctx.allergies, a) })} />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Intolerancias</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(INTOLERANCE_LABELS) as SIntolerance[]).map(i => (
                  <Chip key={i} active={ctx.intolerances.includes(i)} label={INTOLERANCE_LABELS[i]}
                    onClick={() => setCtx({ ...ctx, intolerances: toggleArray(ctx.intolerances, i) })} />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Patologías</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PATHOLOGY_LABELS) as SPathology[]).map(p => (
                  <Chip key={p} active={ctx.pathologies.includes(p)} label={PATHOLOGY_LABELS[p]}
                    onClick={() => setCtx({ ...ctx, pathologies: toggleArray(ctx.pathologies, p) })} />
                ))}
              </div>
            </div>
            <div className="mt-2 p-4 bg-amber-50 rounded-xl text-sm">
              <p className="text-amber-700 font-medium">Recetas compatibles: <span className="text-lg font-bold">{eligible.length}</span> de {SPANISH_RECIPES.length}</p>
            </div>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                <Settings2 className="w-5 h-5 text-purple-500" /> Preferencias del Plan
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Nombre del Plan</label>
                  <input value={planName} onChange={e => setPlanName(e.target.value)}
                    placeholder="Ej: Plan Pérdida Febrero" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Duración</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(w => (
                      <button key={w} onClick={() => setWeekCount(mode === 'blocks' ? w * 2 : w)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                          (mode === 'blocks' ? weekCount === w * 2 : weekCount === w)
                            ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500'
                        }`}>
                        {mode === 'blocks' ? `${w} bloque${w > 1 ? 's' : ''}` : `${w} sem`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-slate-500 mb-1 block">Modo</label>
                <div className="flex gap-2">
                  <button onClick={() => { setMode('weeks'); setWeekCount(1); }}
                    className={`flex-1 p-3 rounded-xl text-left border transition ${mode === 'weeks' ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200'}`}>
                    <span className="text-sm font-medium">Semanal</span>
                    <span className="block text-xs text-slate-400">1-4 semanas</span>
                  </button>
                  <button onClick={() => { setMode('blocks'); setWeekCount(2); }}
                    className={`flex-1 p-3 rounded-xl text-left border transition ${mode === 'blocks' ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200'}`}>
                    <span className="text-sm font-medium">Bloques</span>
                    <span className="block text-xs text-slate-400">Bloques de 2 semanas</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-800 mb-2">Opciones Extra</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: <Coffee className="w-4 h-4" />, label: 'Incluir café', key: 'includeCoffee' as const },
                  { icon: <Cake className="w-4 h-4" />, label: 'Postre en comida', key: 'includeDessertLunch' as const },
                  { icon: <Cake className="w-4 h-4" />, label: 'Postre en cena', key: 'includeDessertDinner' as const },
                  { icon: <Dumbbell className="w-4 h-4" />, label: 'Batidos de proteína', key: 'includeProteinShakes' as const },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setCtx({ ...ctx, [opt.key]: !ctx[opt.key] })}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${ctx[opt.key] ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200'}`}>
                    <span className={ctx[opt.key] ? 'text-green-600' : 'text-slate-400'}>{opt.icon}</span>
                    <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                    {ctx[opt.key] && <Check className="w-4 h-4 text-green-500 ml-auto" />}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block"><Milk className="w-3 h-3 inline" /> Tipo de Leche</label>
                <div className="flex gap-2">
                  {(['dairy', 'plant'] as const).map(m => (
                    <button key={m} onClick={() => setCtx({ ...ctx, milkType: m })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${ctx.milkType === m ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                      {m === 'dairy' ? 'Desnatada/Semi' : 'Vegetal'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Presupuesto</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(b => (
                      <button key={b} onClick={() => setCtx({ ...ctx, budget: b })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${ctx.budget === b ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {b === 'low' ? 'Bajo' : b === 'medium' ? 'Medio' : 'Alto'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Tiempo de Cocina</label>
                  <div className="flex gap-2">
                    {(['minimal', 'moderate', 'extensive'] as const).map(c => (
                      <button key={c} onClick={() => setCtx({ ...ctx, cookingTime: c })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${ctx.cookingTime === c ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {c === 'minimal' ? 'Mínimo' : c === 'moderate' ? 'Moderado' : 'Extenso'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Instrucciones Específicas</label>
                <textarea value={ctx.specificInstructions} onChange={e => setCtx({ ...ctx, specificInstructions: e.target.value })}
                  rows={3} placeholder="Ej: No repetir pollo más de 2 veces/semana, incluir legumbres 3 veces..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Generate */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-500" /> Resumen del Plan
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-400">Calorías</p>
                  <p className="text-lg font-bold text-slate-800">{targetCalories}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-400">Proteína</p>
                  <p className="text-lg font-bold text-blue-800">{macros.protein}g</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl">
                  <p className="text-xs text-amber-400">Carbos</p>
                  <p className="text-lg font-bold text-amber-800">{macros.carbs}g</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl">
                  <p className="text-xs text-red-400">Grasa</p>
                  <p className="text-lg font-bold text-red-800">{macros.fat}g</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Dieta</span>
                  <span className="font-medium text-slate-700">{DIET_LABELS[ctx.dietType]}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Duración</span>
                  <span className="font-medium text-slate-700">
                    {mode === 'blocks' ? `${weekCount / 2} bloque(s)` : `${weekCount} semana(s)`}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Recetas compatibles</span>
                  <span className="font-medium text-slate-700">{eligible.length}</span>
                </div>
                {ctx.allergies.length > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Alergias</span>
                    <span className="font-medium text-red-600">{ctx.allergies.map(a => ALLERGEN_LABELS[a]).join(', ')}</span>
                  </div>
                )}
                {ctx.pathologies.length > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Patologías</span>
                    <span className="font-medium text-amber-600">{ctx.pathologies.map(p => PATHOLOGY_LABELS[p]).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
            {eligible.length < 20 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Pocas recetas compatibles</p>
                  <p className="text-xs text-amber-600 mt-0.5">Con las restricciones seleccionadas solo hay {eligible.length} recetas disponibles. Puede haber repeticiones en el plan.</p>
                </div>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl font-semibold text-lg hover:opacity-95 transition shadow-lg disabled:opacity-60 flex items-center justify-center gap-3"
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generando plan...
                </>
              ) : (
                <>
                  <ChefHat className="w-6 h-6" />
                  Generar Plan Nutricional
                </>
              )}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : navigate('/nutrition')}
            className="flex items-center gap-2 px-5 py-2.5 text-slate-600 hover:text-slate-800 transition text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? 'Cancelar' : 'Anterior'}
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition"
            >
              Siguiente
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
};
