import { SPANISH_RECIPES } from '../data/spanishRecipes';
import type { DayMenu, MealPlan, NutritionistContext, SAllergen, SDietType, SIntolerance, SPathology, SpanishRecipe, SRecipeCategory } from '../types';

/** Lógica de cálculo y generación de menús del asistente de nutrición (sin dependencias de React). */

// ── Cálculos ──────────────────────────────────────────────────────────────────

export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export const ACTIVITY: Record<Activity, { label: string; factor: number }> = {
  sedentary: { label: 'Sedentario (poco o nada de ejercicio)', factor: 1.2 },
  light: { label: 'Ligero (1-3 días/semana)', factor: 1.375 },
  moderate: { label: 'Moderado (3-5 días/semana)', factor: 1.55 },
  active: { label: 'Activo (6-7 días/semana)', factor: 1.725 },
  very_active: { label: 'Muy activo (doble sesión o trabajo físico)', factor: 1.9 },
};

export const GOALS: Record<string, { label: string; delta: number; proteinPerKg: number; fatPct: number }> = {
  lose_weight: { label: 'Pérdida de grasa', delta: -400, proteinPerKg: 2.0, fatPct: 0.27 },
  maintain: { label: 'Mantenimiento', delta: 0, proteinPerKg: 1.6, fatPct: 0.3 },
  gain_muscle: { label: 'Ganancia muscular', delta: 250, proteinPerKg: 2.0, fatPct: 0.27 },
  performance: { label: 'Rendimiento deportivo', delta: 150, proteinPerKg: 1.8, fatPct: 0.25 },
  health: { label: 'Salud general', delta: 0, proteinPerKg: 1.4, fatPct: 0.32 },
};

export const DIETS: Record<SDietType, string> = { omnivore: 'Omnívora', mediterranean: 'Mediterránea', pescetarian: 'Pescetariana', vegetarian: 'Vegetariana', vegan: 'Vegana' };
export const ALLERGENS: Record<SAllergen, string> = { gluten: 'Gluten', lactosa: 'Lácteos', huevos: 'Huevos', frutos_secos: 'Frutos secos', pescado: 'Pescado', mariscos: 'Mariscos', soja: 'Soja', sesamo: 'Sésamo', mostaza: 'Mostaza', apio: 'Apio' };
export const INTOLERANCES: Record<SIntolerance, string> = { lactosa: 'Lactosa', fructosa: 'Fructosa', histamina: 'Histamina', fodmap: 'FODMAP', sorbitol: 'Sorbitol', sulfitos: 'Sulfitos', cafeina: 'Cafeína', salicilatos: 'Salicilatos', oxalatos: 'Oxalatos', polioles: 'Polioles', gluten: 'Gluten (no celíaco)', solanaceas: 'Solanáceas' };
export const PATHOLOGIES: Record<SPathology, string> = { diabetes_t2: 'Diabetes tipo 2', hipertension: 'Hipertensión', hipotiroidismo: 'Hipotiroidismo', anemia: 'Anemia', osteoporosis: 'Osteoporosis', celiaquía: 'Celiaquía', crohn: 'Crohn', colon_irritable: 'Colon irritable', reflujo: 'Reflujo', colesterol_alto: 'Colesterol alto', gota: 'Gota', insuf_renal: 'Insuficiencia renal', higado_graso: 'Hígado graso', hipoglucemia: 'Hipoglucemia', hiperuricemia: 'Hiperuricemia', artritis: 'Artritis', sibo: 'SIBO' };

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function bmr(weight: number, height: number, age: number, gender: 'male' | 'female'): number {
  return gender === 'female' ? 10 * weight + 6.25 * height - 5 * age - 161 : 10 * weight + 6.25 * height - 5 * age + 5;
}

export function macrosFor(calories: number, weight: number, goal: string) {
  const g = GOALS[goal] ?? GOALS.maintain;
  const protein = Math.round(g.proteinPerKg * weight);
  const fat = Math.round((calories * g.fatPct) / 9);
  const carbs = Math.max(80, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, fat, carbs };
}

// ── Generador de menús ────────────────────────────────────────────────────────

interface Slot {
  mealType: MealPlan['mealType'];
  category: SRecipeCategory;
  share: number;
  onlyGroup?: string;
}

function slotsFor(ctx: NutritionistContext): Slot[] {
  const base: Slot[] =
    ctx.mealsPerDay <= 3
      ? [{ mealType: 'breakfast', category: 'breakfast', share: 0.3 }, { mealType: 'lunch', category: 'lunch', share: 0.4 }, { mealType: 'dinner', category: 'dinner', share: 0.3 }]
      : ctx.mealsPerDay === 4
        ? [{ mealType: 'breakfast', category: 'breakfast', share: 0.25 }, { mealType: 'mid_morning', category: 'mid_morning', share: 0.1 }, { mealType: 'lunch', category: 'lunch', share: 0.35 }, { mealType: 'dinner', category: 'dinner', share: 0.3 }]
        : [{ mealType: 'breakfast', category: 'breakfast', share: 0.22 }, { mealType: 'mid_morning', category: 'mid_morning', share: 0.1 }, { mealType: 'lunch', category: 'lunch', share: 0.33 }, { mealType: 'snack', category: 'snack', share: 0.1 }, { mealType: 'dinner', category: 'dinner', share: 0.25 }];
  if (ctx.includeDessertLunch) {
    const lunch = base.find((s) => s.mealType === 'lunch')!;
    lunch.share -= 0.05;
    base.splice(base.indexOf(lunch) + 1, 0, { mealType: 'dessert', category: 'snack', share: 0.05, onlyGroup: 'tentempie-fruta' });
  }
  if (ctx.includeDessertDinner) {
    const dinner = base.find((s) => s.mealType === 'dinner')!;
    dinner.share -= 0.04;
    base.push({ mealType: 'dessert', category: 'snack', share: 0.04, onlyGroup: 'tentempie-lacteo' });
  }
  return base;
}

/**
 * Recetas compatibles con el paciente. Las restricciones de salud (dieta, alergias, intolerancias,
 * patologías) son siempre estrictas; tiempo de cocina y presupuesto son preferencias que el
 * planificador puede relajar (`relaxed`) cuando de otro modo un hueco se quedaría sin plato.
 */
export function eligible(ctx: NutritionistContext, relaxed = false): SpanishRecipe[] {
  const maxTime = relaxed ? 999 : ctx.cookingTime === 'minimal' ? 15 : ctx.cookingTime === 'moderate' ? 40 : 999;
  return SPANISH_RECIPES.filter((r) => {
    if (!r.dietTypes.includes(ctx.dietType)) return false;
    if (r.allergens.some((a) => ctx.allergies.includes(a))) return false;
    if (r.intolerances.some((i) => ctx.intolerances.includes(i))) return false;
    if (r.pathologyContraindications.some((p) => ctx.pathologies.includes(p))) return false;
    if (ctx.pathologies.includes('celiaquía') && r.allergens.includes('gluten')) return false;
    if (ctx.milkType === 'plant' && r.allergens.includes('lactosa') && r.category !== 'lunch' && r.category !== 'dinner') return false;
    if (r.prepTime + r.cookTime > maxTime) return false;
    if (!relaxed && ctx.budget === 'low' && r.budget === 'high') return false;
    return true;
  });
}

/** Avisos que el planificador deja al generar (huecos cubiertos relajando preferencias, poca variedad…). */
export interface PlanReport {
  warnings: string[];
  /** Recetas distintas usadas en el plan. */
  distinctRecipes: number;
}

/** Reparto de macros como fracción de las calorías (proteína, hidratos, grasa). */
type MacroShares = { p: number; c: number; f: number };
const sharesOf = (calories: number, protein: number, carbs: number, fat: number): MacroShares => {
  const total = Math.max(1, protein * 4 + carbs * 4 + fat * 9);
  return { p: (protein * 4) / total, c: (carbs * 4) / total, f: (fat * 9) / total };
};

/**
 * Elige la receta que mejor encaja en un hueco: calorías cercanas al objetivo sin forzar la ración,
 * reparto de macros parecido al del plan (compensando lo que llevan las comidas ya elegidas),
 * sin repetir platos recientes ni el mismo grupo dos veces seguidas.
 */
interface PickOpts {
  /** Ids de platos usados en los últimos días (misma franja o no). */
  recent: string[];
  /** Grupos de intercambio de las últimas comidas del mismo día. */
  recentGroups: string[];
  /** Plato que ocupó esta misma franja el día anterior. */
  yesterdaySameSlot?: string;
  /** Veces que se ha usado cada receta en todo el plan. */
  uses: Map<string, number>;
  seed: number;
}

function pick(candidates: SpanishRecipe[], targetKcal: number, wantShares: MacroShares, o: PickOpts): SpanishRecipe | null {
  if (!candidates.length) return null;
  const minUses = Math.min(...candidates.map((r) => o.uses.get(r.id) ?? 0));
  const scored = candidates.map((r, i) => {
    const factor = targetKcal / r.calories;
    const fit = Math.abs(Math.log(Math.min(1.6, Math.max(0.6, factor)) / factor)) * 3 + Math.abs(1 - factor);
    const s = sharesOf(r.calories, r.protein, r.carbs, r.fat);
    const macroFit = (Math.abs(s.p - wantShares.p) * 2 + Math.abs(s.c - wantShares.c) + Math.abs(s.f - wantShares.f)) * 4;
    const repeat = o.recent.includes(r.id) ? 5 : 0;
    // Nunca el mismo plato en la misma franja dos días seguidos si hay alternativa, y reparto
    // equitativo del uso de cada receta a lo largo del plan (evita "el mismo plato 14 veces").
    const yesterday = r.id === o.yesterdaySameSlot && candidates.length > 1 ? 8 : 0;
    const overuse = ((o.uses.get(r.id) ?? 0) - minUses) * 2.5;
    const sameGroup = r.swapGroup && o.recentGroups.includes(r.swapGroup) ? 1.2 : 0;
    const jitter = ((o.seed * 9301 + i * 49297) % 233280) / 233280;
    return { r, score: fit + macroFit + repeat + yesterday + overuse + sameGroup + jitter * 0.6 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].r;
}

/** Categorías que pueden cubrir un hueco cuando la propia no tiene platos compatibles. */
const FALLBACK_CATEGORIES: Record<SRecipeCategory, SRecipeCategory[]> = {
  breakfast: ['mid_morning', 'snack'],
  mid_morning: ['snack', 'breakfast'],
  lunch: ['dinner'],
  snack: ['mid_morning', 'breakfast'],
  dinner: ['lunch'],
};

export function buildDays(ctx: NutritionistContext, targets: { calories: number; protein: number; carbs: number; fat: number }, weekCount: number, mode: 'weeks' | 'blocks', competitionDate?: string, report?: PlanReport): DayMenu[] {
  const pool = eligible(ctx);
  const relaxedPool = eligible(ctx, true);
  const slots = slotsFor(ctx);
  const uniqueDays = mode === 'blocks' ? Math.min(14, weekCount * 7) : weekCount * 7;
  const days: DayMenu[] = [];
  const history: { id: string; group?: string }[] = [];
  const uses = new Map<string, number>();
  const relaxedSlots = new Set<string>();
  const borrowedSlots = new Set<string>();
  /**
   * Candidatos para un hueco, del más fiel al más permisivo: la categoría del hueco (y su grupo si
   * se pide) con las preferencias de tiempo/presupuesto → misma categoría relajando preferencias →
   * categorías vecinas → cualquier plato compatible. Las restricciones de salud nunca se relajan.
   */
  const candidatesFor = (slot: ReturnType<typeof slotsFor>[number]): SpanishRecipe[] => {
    const inCat = (p: SpanishRecipe[], cat: SRecipeCategory) => p.filter((r) => r.category === cat);
    if (slot.onlyGroup) {
      const grp = pool.filter((r) => r.swapGroup === slot.onlyGroup);
      if (grp.length) return grp;
      const alt = pool.filter((r) => r.category === 'snack' || r.category === 'mid_morning');
      if (alt.length) return alt;
    }
    let c = inCat(pool, slot.category);
    if (c.length) return c;
    c = inCat(relaxedPool, slot.category);
    if (c.length) { relaxedSlots.add(slot.mealType); return c; }
    for (const cat of FALLBACK_CATEGORIES[slot.category]) {
      c = inCat(pool, cat);
      if (c.length) { borrowedSlots.add(slot.mealType); return c; }
    }
    for (const cat of FALLBACK_CATEGORIES[slot.category]) {
      c = inCat(relaxedPool, cat);
      if (c.length) { relaxedSlots.add(slot.mealType); borrowedSlots.add(slot.mealType); return c; }
    }
    if (relaxedPool.length) { relaxedSlots.add(slot.mealType); borrowedSlots.add(slot.mealType); }
    return relaxedPool;
  };
  const shakeDays = new Set<number>();
  if (ctx.includeProteinShakes && ctx.proteinShakeDays > 0) {
    const step = 7 / Math.min(7, ctx.proteinShakeDays);
    for (let i = 0; i < 7; i++) if (Math.floor(i / step) !== Math.floor((i - 1) / step)) shakeDays.add(i);
  }
  const comp = competitionDate ? new Date(competitionDate) : null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let d = 0; d < uniqueDays; d++) {
    const dayDate = new Date(start.getTime() + d * 86_400_000);
    const daysToComp = comp ? Math.round((comp.getTime() - dayDate.getTime()) / 86_400_000) : null;
    const preComp = ctx.isPreCompetition && daysToComp !== null && daysToComp >= 0 && daysToComp <= 2;
    const dayKcal = preComp ? Math.round(targets.calories * 1.1) : targets.calories;
    const dayShares = sharesOf(targets.calories, targets.protein, targets.carbs, targets.fat);
    const meals: MealPlan[] = [];
    for (const slot of slots) {
      const cands = candidatesFor(slot);
      const target = Math.round(dayKcal * slot.share);
      const recentIds = history.slice(-(slots.length * 3)).map((h) => h.id);
      const recentGroups = meals.length ? history.slice(-meals.length).map((h) => h.group || '') : [];
      const yesterdaySameSlot = days[d - 1]?.meals.find((m) => m.mealType === slot.mealType)?.recipeId;
      // Lo que falta del día para cuadrar macros: se pide a este hueco lo que las comidas anteriores no han cubierto.
      const done = meals.reduce((t, m) => ({ c: t.c + m.calories, p: t.p + m.protein, h: t.h + m.carbs, f: t.f + m.fat }), { c: 0, p: 0, h: 0, f: 0 });
      const remainKcal = Math.max(200, dayKcal - done.c);
      const want: MacroShares = {
        p: Math.min(0.6, Math.max(0.08, ((targets.protein - done.p) * 4) / remainKcal)),
        c: Math.min(0.75, Math.max(0.1, ((targets.carbs - done.h) * 4) / remainKcal)),
        f: Math.min(0.55, Math.max(0.1, ((targets.fat - done.f) * 9) / remainKcal)),
      };
      const wantShares = meals.length ? want : dayShares;
      const r = pick(cands, target, wantShares, { recent: recentIds, recentGroups, yesterdaySameSlot, uses, seed: d * 31 + meals.length * 7 });
      if (!r) continue;
      uses.set(r.id, (uses.get(r.id) ?? 0) + 1);
      const factor = Math.min(1.6, Math.max(0.6, target / r.calories));
      const carbBoost = preComp && (slot.mealType === 'lunch' || slot.mealType === 'dinner') ? 1.15 : 1;
      meals.push({
        mealType: slot.mealType,
        recipeId: r.id,
        recipeName: factor > 1.25 ? `${r.name} (ración grande)` : factor < 0.75 ? `${r.name} (ración pequeña)` : r.name,
        calories: Math.round(r.calories * factor * carbBoost),
        protein: Math.round(r.protein * factor),
        carbs: Math.round(r.carbs * factor * carbBoost),
        fat: Math.round(r.fat * factor),
      });
      history.push({ id: r.id, group: r.swapGroup });
    }
    if (shakeDays.has(d % 7)) {
      const shakes = (pool.some((r) => r.swapGroup === 'tentempie-batido') ? pool : relaxedPool).filter((r) => r.swapGroup === 'tentempie-batido');
      const s = shakes[d % Math.max(1, shakes.length)];
      if (s) meals.push({ mealType: 'protein_shake', recipeId: s.id, recipeName: s.name, calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat });
    }
    const totals = meals.reduce((t, m) => ({ c: t.c + m.calories, p: t.p + m.protein, h: t.h + m.carbs, f: t.f + m.fat }), { c: 0, p: 0, h: 0, f: 0 });
    days.push({
      dayNumber: d + 1,
      dayName: `${DAY_NAMES[d % 7]}${uniqueDays > 7 ? ` · S${Math.floor(d / 7) + 1}` : ''}`,
      weekNumber: Math.floor(d / 7) + 1,
      meals,
      totalCalories: totals.c,
      totalProtein: totals.p,
      totalCarbs: totals.h,
      totalFat: totals.f,
      isPreCompDay: preComp || undefined,
      notes: preComp ? 'Día de carga: más hidratos, menos fibra y grasa; hidratación abundante.' : undefined,
    });
  }
  // Modo bloques: el bloque de 2 semanas se repite hasta completar el plan.
  if (mode === 'blocks' && weekCount * 7 > uniqueDays) {
    const total = weekCount * 7;
    for (let d = uniqueDays; d < total; d++) {
      const src = days[d % uniqueDays];
      days.push({ ...src, dayNumber: d + 1, dayName: `${DAY_NAMES[d % 7]} · S${Math.floor(d / 7) + 1}`, weekNumber: Math.floor(d / 7) + 1, meals: src.meals.map((m) => ({ ...m })) });
    }
  }
  if (report) {
    const label = (t: string) => SLOT_LABELS[t] ?? t;
    report.distinctRecipes = uses.size;
    if (relaxedSlots.size) report.warnings.push(`Para ${[...relaxedSlots].map(label).join(', ')} no había platos con el tiempo de cocina o presupuesto indicados; se han usado recetas compatibles con la salud del paciente aunque lleven más tiempo o coste.`);
    if (borrowedSlots.size) report.warnings.push(`En ${[...borrowedSlots].map(label).join(', ')} se han usado platos de otras franjas por falta de recetas compatibles.`);
    const perDay = slots.length;
    if (uses.size < perDay * 3) report.warnings.push(`Solo hay ${uses.size} recetas compatibles con estas restricciones: el menú se repetirá con frecuencia. Amplía el recetario o revisa las restricciones.`);
    const empty = days.filter((day) => day.meals.length < perDay).length;
    if (empty) report.warnings.push(`${empty} día(s) tienen huecos sin plato porque no existe ninguna receta compatible.`);
  }
  return days;
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'desayuno', mid_morning: 'media mañana', lunch: 'comida', snack: 'merienda', dinner: 'cena', dessert: 'postre', protein_shake: 'batido',
};

