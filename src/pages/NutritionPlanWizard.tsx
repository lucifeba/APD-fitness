import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInYears } from 'date-fns';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { ACTIVITY, ALLERGENS, DIETS, GOALS, INTOLERANCES, PATHOLOGIES, bmr, buildDays, eligible, macrosFor, type Activity, type PlanReport } from '../lib/nutritionPlanner';
import type { NutritionistContext, NutritionPlanV2, SAllergen, SDietType, SIntolerance, SPathology, SRecipeCategory } from '../types';
import { ChevronLeft, ChevronRight, ChefHat, User, Utensils, HeartPulse, ClipboardList, Check, Sparkles, AlertTriangle } from 'lucide-react';

// ── Componente ────────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'patient', label: 'Paciente', icon: User },
  { key: 'structure', label: 'Dieta y estructura', icon: Utensils },
  { key: 'health', label: 'Salud', icon: HeartPulse },
  { key: 'review', label: 'Revisión', icon: ClipboardList },
] as const;

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'green' | 'red' | 'amber' }> = ({ active, onClick, children, tone = 'green' }) => {
  const on = tone === 'red' ? 'bg-red-600 border-red-600 text-white' : tone === 'amber' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-green-600 border-green-600 text-white';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? on : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
      {children}
    </button>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
  </label>
);

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500';

export const NutritionPlanWizard: React.FC = () => {
  const navigate = useNavigate();
  const { athletes, addNutritionPlanV2 } = useStore();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);

  // Paciente
  const [athleteId, setAthleteId] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState(35);
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [weight, setWeight] = useState(70);
  const [height, setHeight] = useState(170);
  const [activity, setActivity] = useState<Activity>('moderate');
  const [goal, setGoal] = useState('maintain');
  const [description, setDescription] = useState('');

  // Estructura
  const [dietType, setDietType] = useState<SDietType>('mediterranean');
  const [mealsPerDay, setMealsPerDay] = useState(5);
  const [mode, setMode] = useState<'weeks' | 'blocks'>('weeks');
  const [weekCount, setWeekCount] = useState(2);
  const [includeCoffee, setIncludeCoffee] = useState(true);
  const [milkType, setMilkType] = useState<'dairy' | 'plant'>('dairy');
  const [dessertLunch, setDessertLunch] = useState(false);
  const [dessertDinner, setDessertDinner] = useState(false);
  const [shakes, setShakes] = useState(false);
  const [shakeDays, setShakeDays] = useState(3);
  const [preComp, setPreComp] = useState(false);
  const [compDate, setCompDate] = useState('');
  const [budget, setBudget] = useState<'low' | 'medium' | 'high'>('medium');
  const [cookingTime, setCookingTime] = useState<'minimal' | 'moderate' | 'extensive'>('moderate');

  // Salud
  const [allergies, setAllergies] = useState<SAllergen[]>([]);
  const [intolerances, setIntolerances] = useState<SIntolerance[]>([]);
  const [pathologies, setPathologies] = useState<SPathology[]>([]);
  const [restrictions, setRestrictions] = useState('');
  const [instructions, setInstructions] = useState('');

  // Revisión (objetivos editables)
  const [calOverride, setCalOverride] = useState<number | null>(null);
  const [macroOverride, setMacroOverride] = useState<{ protein: number; carbs: number; fat: number } | null>(null);

  const applyAthlete = (id: string) => {
    setAthleteId(id);
    const a = athletes.find((x) => x.id === id);
    if (!a) return;
    setName(a.name);
    if (a.weight) setWeight(a.weight);
    if (a.height) setHeight(a.height);
    if (a.gender === 'male' || a.gender === 'female') setGender(a.gender);
    if (a.birthDate) {
      const y = differenceInYears(new Date(), new Date(a.birthDate));
      if (y > 10 && y < 100) setAge(y);
    }
    if (a.level === 'elite') setActivity('very_active');
    else if (a.level === 'advanced') setActivity('active');
    else if (a.level === 'intermediate') setActivity('moderate');
    else if (a.level === 'beginner') setActivity('light');
    setGoal('performance');
  };

  const tdee = useMemo(() => Math.round(bmr(weight, height, age, gender) * ACTIVITY[activity].factor), [weight, height, age, gender, activity]);
  const targetCalories = calOverride ?? Math.max(1200, Math.round((tdee + (GOALS[goal]?.delta ?? 0)) / 10) * 10);
  const macros = macroOverride ?? macrosFor(targetCalories, weight, goal);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const ctx: NutritionistContext = {
    patientDescription: description,
    goal,
    dietType,
    allergies,
    intolerances,
    pathologies,
    mealsPerDay,
    specificRestrictions: restrictions,
    specificInstructions: instructions,
    includeCoffee,
    milkType,
    includeDessertLunch: dessertLunch,
    includeDessertDinner: dessertDinner,
    dessertTypes: [],
    includeProteinShakes: shakes,
    proteinShakeDays: shakes ? shakeDays : 0,
    isPreCompetition: preComp,
    competitionDate: compDate,
    budget,
    cookingTime,
  };

  const poolByCategory = useMemo(() => {
    const p = eligible(ctx);
    return { total: p.length, byCat: (['breakfast', 'mid_morning', 'lunch', 'snack', 'dinner'] as SRecipeCategory[]).map((c) => ({ c, n: p.filter((r) => r.category === c).length })) };
  }, [dietType, allergies, intolerances, pathologies, milkType, budget, cookingTime]); // eslint-disable-line react-hooks/exhaustive-deps
  const poolSize = poolByCategory.total;
  const tooFewRecipes = poolByCategory.byCat.some((x) => (x.c === 'breakfast' || x.c === 'lunch' || x.c === 'dinner') && x.n < 3);

  const canNext = step === 0 ? name.trim().length > 0 && weight > 30 && height > 120 && age > 10 : true;

  const generate = () => {
    setGenerating(true);
    const effectiveWeeks = mode === 'blocks' ? Math.max(2, weekCount % 2 ? weekCount + 1 : weekCount) : weekCount;
    // El planificador deja avisos (huecos cubiertos relajando preferencias, poca variedad) que se guardan en las notas del plan.
    const report: PlanReport = { warnings: [], distinctRecipes: 0 };
    const days = buildDays(ctx, { calories: targetCalories, ...macros }, effectiveWeeks, mode, preComp ? compDate : undefined, report);
    const plan: Omit<NutritionPlanV2, 'id'> = {
      trainerId: '',
      athleteId: athleteId || undefined,
      name: `${GOALS[goal]?.label ?? 'Plan'} · ${name.trim()}`,
      mode,
      weekCount: effectiveWeeks,
      blockSize: mode === 'blocks' ? 14 : 7,
      days,
      targetCalories,
      targetProtein: macros.protein,
      targetCarbs: macros.carbs,
      targetFat: macros.fat,
      context: ctx,
      notes: [restrictions && `Restricciones: ${restrictions}`, instructions && `Instrucciones: ${instructions}`, ...report.warnings.map((w) => `Aviso: ${w}`)].filter(Boolean).join('\n') || undefined,
      preCompetitionDate: preComp && compDate ? compDate : undefined,
      createdAt: new Date().toISOString(),
      age,
      gender,
      weight,
      height,
      activityLevel: activity,
    };
    const created = addNutritionPlanV2(plan);
    setTimeout(() => navigate(`/nutrition/plan/${created.id}`), 300);
  };

  const catLabel = (c: SRecipeCategory) => (c === 'breakfast' ? 'desayunos' : c === 'mid_morning' ? 'media mañana' : c === 'lunch' ? 'comidas' : c === 'snack' ? 'meriendas' : 'cenas');

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/nutrition')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ChefHat className="w-6 h-6 text-green-500" /> Asistente de plan nutricional</h1>
            <p className="text-sm text-slate-400">Cuestionario de nutricionista: paciente, estructura, salud y revisión</p>
          </div>
        </div>

        {/* Pasos */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state = i < step ? 'done' : i === step ? 'current' : 'todo';
            return (
              <button key={s.key} onClick={() => i < step && setStep(i)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${state === 'current' ? 'bg-green-600 text-white border-green-600' : state === 'done' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-400 border-slate-200'}`}>
                {state === 'done' ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 space-y-5">
          {/* PASO 1: PACIENTE */}
          {step === 0 && (
            <>
              <Field label="Deportista de tu lista (opcional)" hint="Rellena peso, talla, edad y nivel automáticamente.">
                <select className={inputCls} value={athleteId} onChange={(e) => applyAthlete(e.target.value)}>
                  <option value="">Sin vincular (paciente externo)</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nombre del paciente"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" /></Field>
                <Field label="Objetivo">
                  <select className={inputCls} value={goal} onChange={(e) => { setGoal(e.target.value); setCalOverride(null); setMacroOverride(null); }}>
                    {Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Edad"><input type="number" className={inputCls} value={age} onChange={(e) => setAge(Number(e.target.value))} /></Field>
                <Field label="Sexo">
                  <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female')}><option value="female">Mujer</option><option value="male">Hombre</option></select>
                </Field>
                <Field label="Peso (kg)"><input type="number" className={inputCls} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
                <Field label="Talla (cm)"><input type="number" className={inputCls} value={height} onChange={(e) => setHeight(Number(e.target.value))} /></Field>
              </div>
              <Field label="Actividad física">
                <select className={inputCls} value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
                  {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Descripción del paciente" hint="Contexto que ayuda a personalizar: horarios, entrenamientos, hábitos, preferencias.">
                <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej.: triatleta amateur, entrena por las mañanas, come fuera los martes…" />
              </Field>
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 flex items-center justify-between">
                <span>Gasto energético estimado (TDEE)</span>
                <span className="font-bold text-slate-800">{tdee} kcal</span>
              </div>
            </>
          )}

          {/* PASO 2: DIETA Y ESTRUCTURA */}
          {step === 1 && (
            <>
              <Field label="Tipo de dieta">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(DIETS) as SDietType[]).map((d) => <Chip key={d} active={dietType === d} onClick={() => setDietType(d)}>{DIETS[d]}</Chip>)}
                </div>
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Comidas al día">
                  <select className={inputCls} value={mealsPerDay} onChange={(e) => setMealsPerDay(Number(e.target.value))}>
                    <option value={3}>3 (desayuno, comida, cena)</option>
                    <option value={4}>4 (+ media mañana)</option>
                    <option value={5}>5 (+ merienda)</option>
                  </select>
                </Field>
                <Field label="Estructura">
                  <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as 'weeks' | 'blocks')}>
                    <option value="weeks">Semanas distintas</option>
                    <option value="blocks">Bloques de 2 semanas que se repiten</option>
                  </select>
                </Field>
                <Field label="Duración (semanas)">
                  <select className={inputCls} value={weekCount} onChange={(e) => setWeekCount(Number(e.target.value))}>
                    {[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w} {w === 1 ? 'semana' : 'semanas'}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Presupuesto">
                  <div className="flex gap-2">{(['low', 'medium', 'high'] as const).map((b) => <Chip key={b} active={budget === b} onClick={() => setBudget(b)}>{b === 'low' ? 'Ajustado' : b === 'medium' ? 'Medio' : 'Sin límite'}</Chip>)}</div>
                </Field>
                <Field label="Tiempo para cocinar">
                  <div className="flex gap-2">{(['minimal', 'moderate', 'extensive'] as const).map((c) => <Chip key={c} active={cookingTime === c} onClick={() => setCookingTime(c)}>{c === 'minimal' ? 'Mínimo (≤15 min)' : c === 'moderate' ? 'Moderado (≤40 min)' : 'Sin prisa'}</Chip>)}</div>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200"><input type="checkbox" checked={includeCoffee} onChange={(e) => setIncludeCoffee(e.target.checked)} className="accent-green-600" /> Incluye café</label>
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
                  <span className="flex-1">Leche</span>
                  <select className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" value={milkType} onChange={(e) => setMilkType(e.target.value as 'dairy' | 'plant')}><option value="dairy">De vaca</option><option value="plant">Vegetal</option></select>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200"><input type="checkbox" checked={dessertLunch} onChange={(e) => setDessertLunch(e.target.checked)} className="accent-green-600" /> Postre en la comida (fruta)</label>
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200"><input type="checkbox" checked={dessertDinner} onChange={(e) => setDessertDinner(e.target.checked)} className="accent-green-600" /> Postre en la cena (lácteo)</label>
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
                  <input type="checkbox" checked={shakes} onChange={(e) => setShakes(e.target.checked)} className="accent-green-600" /> Batidos de proteína
                  {shakes && <select className="ml-auto bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" value={shakeDays} onChange={(e) => setShakeDays(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} días/sem</option>)}</select>}
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
                  <input type="checkbox" checked={preComp} onChange={(e) => setPreComp(e.target.checked)} className="accent-green-600" /> Pre-competición
                  {preComp && <input type="date" className="ml-auto bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs" value={compDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCompDate(e.target.value)} />}
                </label>
              </div>
            </>
          )}

          {/* PASO 3: SALUD */}
          {step === 2 && (
            <>
              <Field label="Alergias">
                <div className="flex flex-wrap gap-2">{(Object.keys(ALLERGENS) as SAllergen[]).map((a) => <Chip key={a} tone="red" active={allergies.includes(a)} onClick={() => toggle(allergies, a, setAllergies)}>{ALLERGENS[a]}</Chip>)}</div>
              </Field>
              <Field label="Intolerancias">
                <div className="flex flex-wrap gap-2">{(Object.keys(INTOLERANCES) as SIntolerance[]).map((i) => <Chip key={i} tone="amber" active={intolerances.includes(i)} onClick={() => toggle(intolerances, i, setIntolerances)}>{INTOLERANCES[i]}</Chip>)}</div>
              </Field>
              <Field label="Patologías">
                <div className="flex flex-wrap gap-2">{(Object.keys(PATHOLOGIES) as SPathology[]).map((p) => <Chip key={p} active={pathologies.includes(p)} onClick={() => toggle(pathologies, p, setPathologies)}>{PATHOLOGIES[p]}</Chip>)}</div>
              </Field>
              <Field label="Restricciones concretas" hint="Alimentos que no quiere o no puede tomar, aunque no sean alergias.">
                <textarea className={inputCls} rows={2} value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Ej.: no le gusta el pescado azul, evita el picante…" />
              </Field>
              <div className={`rounded-xl p-4 text-sm flex items-start gap-3 ${tooFewRecipes ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
                {tooFewRecipes ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />}
                <div>
                  <p className="font-medium">{poolSize} recetas compatibles con este perfil</p>
                  <p className="text-xs mt-0.5">{poolByCategory.byCat.map((x) => `${catLabel(x.c)}: ${x.n}`).join(' · ')}{tooFewRecipes ? '. Con tan pocas opciones el menú repetirá platos; revisa las restricciones.' : ''}</p>
                </div>
              </div>
            </>
          )}

          {/* PASO 4: REVISIÓN */}
          {step === 3 && (
            <>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                  <p className="font-semibold text-slate-800">{name}</p>
                  <p className="text-slate-500">{age} años · {gender === 'female' ? 'mujer' : 'hombre'} · {weight} kg · {height} cm</p>
                  <p className="text-slate-500">{ACTIVITY[activity].label}</p>
                  <p className="text-slate-500">{GOALS[goal]?.label} · dieta {DIETS[dietType].toLowerCase()} · {mealsPerDay} comidas</p>
                  <p className="text-slate-500">{mode === 'blocks' ? `${weekCount} semanas en bloques de 2` : `${weekCount} ${weekCount === 1 ? 'semana' : 'semanas'}`}{preComp && compDate ? ` · competición ${compDate}` : ''}</p>
                  {allergies.length || intolerances.length || pathologies.length ? (
                    <p className="text-red-600 text-xs pt-1">Evita: {[...allergies.map((a) => ALLERGENS[a]), ...intolerances.map((i) => INTOLERANCES[i]), ...pathologies.map((p) => PATHOLOGIES[p])].join(', ')}</p>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <Field label="Calorías objetivo / día" hint={`TDEE ${tdee} kcal ${GOALS[goal]?.delta ? `${GOALS[goal].delta > 0 ? '+' : ''}${GOALS[goal].delta}` : '± 0'}`}>
                    <input type="number" className={inputCls} value={targetCalories} onChange={(e) => { setCalOverride(Number(e.target.value)); setMacroOverride(null); }} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    {(['protein', 'carbs', 'fat'] as const).map((k) => (
                      <Field key={k} label={k === 'protein' ? 'Proteína (g)' : k === 'carbs' ? 'Hidratos (g)' : 'Grasas (g)'}>
                        <input type="number" className={inputCls} value={macros[k]} onChange={(e) => setMacroOverride({ ...macros, [k]: Number(e.target.value) })} />
                      </Field>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">Reparto: {Math.round(((macros.protein * 4) / targetCalories) * 100)} % proteína · {Math.round(((macros.carbs * 4) / targetCalories) * 100)} % hidratos · {Math.round(((macros.fat * 9) / targetCalories) * 100)} % grasas</p>
                </div>
              </div>
              <Field label="Instrucciones para el plan" hint="Se guardan con el plan y se muestran en el detalle.">
                <textarea className={inputCls} rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Ej.: comida principal antes del entreno de tarde, cena ligera los días de doble sesión…" />
              </Field>
            </>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => (step === 0 ? navigate('/nutrition') : setStep(step - 1))} className="flex items-center gap-1 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition">
              <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancelar' : 'Anterior'}
            </button>
            {step < STEPS.length - 1 ? (
              <button disabled={!canNext} onClick={() => setStep(step + 1)} className="flex items-center gap-1 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button disabled={generating || poolSize === 0} onClick={generate} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-semibold hover:opacity-95 transition shadow-md disabled:opacity-60">
                <Sparkles className="w-4 h-4" /> {generating ? 'Generando…' : 'Generar plan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};
