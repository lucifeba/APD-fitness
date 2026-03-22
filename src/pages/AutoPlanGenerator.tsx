import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useStore } from '../store/useStore';
import { EXERCISES_DB } from '../data/exercises';
import type { TrainingPlan, PlanWeek, WorkoutDay, WorkoutExercise, WorkoutSet, Exercise } from '../types';
import {
  Wand2, ChevronRight, ChevronLeft, CheckCircle2,
  Target, Calendar, Dumbbell, AlertTriangle,
  Zap, TrendingUp, Heart, Shield, Star,
} from 'lucide-react';

// ── Tipos del wizard ──────────────────────────────────────────────────────────
type Objective = 'strength' | 'hypertrophy' | 'weight_loss' | 'endurance' | 'athletic' | 'toning' | 'health';
type TrainingLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite';
type AvailableEquipment = 'full_gym' | 'home_basic' | 'home_advanced' | 'outdoor';

interface WizardData {
  objective: Objective | '';
  level: TrainingLevel | '';
  daysPerWeek: number;
  sessionDuration: number; // minutes
  equipment: AvailableEquipment | '';
  focusMuscles: string[];
  injuries: string[];
  includeCardio: boolean;
  includeMobility: boolean;
  planName: string;
  planDuration: number; // weeks
}

const INITIAL_WIZARD: WizardData = {
  objective: '',
  level: '',
  daysPerWeek: 0,
  sessionDuration: 0,
  equipment: '',
  focusMuscles: [],
  injuries: [],
  includeCardio: false,
  includeMobility: false,
  planName: '',
  planDuration: 0,
};

// ── Helpers de generación ─────────────────────────────────────────────────────
const generateId = () => Math.random().toString(36).substring(2, 11);

const SPLIT_CONFIGS: Record<number, { days: { name: string; focus: string; muscles: string[] }[] }> = {
  2: {
    days: [
      { name: 'Sesión A - Tren Superior', focus: 'Tren Superior', muscles: ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps'] },
      { name: 'Sesión B - Tren Inferior', focus: 'Tren Inferior', muscles: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core / Abdomen'] },
    ],
  },
  3: {
    days: [
      { name: 'Empuje (Push)', focus: 'Pecho, Hombros, Tríceps', muscles: ['Pecho', 'Hombros', 'Tríceps'] },
      { name: 'Tirón (Pull)', focus: 'Espalda, Bíceps, Antebrazos', muscles: ['Espalda', 'Bíceps', 'Antebrazos'] },
      { name: 'Piernas y Core', focus: 'Cuádriceps, Isquiotibiales, Glúteos, Core', muscles: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core / Abdomen'] },
    ],
  },
  4: {
    days: [
      { name: 'Tren Superior A', focus: 'Pecho, Espalda', muscles: ['Pecho', 'Espalda'] },
      { name: 'Tren Inferior A', focus: 'Cuádriceps, Isquiotibiales, Glúteos', muscles: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Core / Abdomen'] },
      { name: 'Tren Superior B', focus: 'Hombros, Bíceps, Tríceps, Antebrazos', muscles: ['Hombros', 'Bíceps', 'Tríceps', 'Antebrazos'] },
      { name: 'Tren Inferior B', focus: 'Pantorrillas, Core, Movilidad', muscles: ['Pantorrillas', 'Core / Abdomen', 'Movilidad / Flexibilidad'] },
    ],
  },
  5: {
    days: [
      { name: 'Pecho y Tríceps', focus: 'Pecho, Tríceps', muscles: ['Pecho', 'Tríceps'] },
      { name: 'Espalda y Bíceps', focus: 'Espalda, Bíceps, Antebrazos', muscles: ['Espalda', 'Bíceps', 'Antebrazos'] },
      { name: 'Hombros y Core', focus: 'Hombros, Core, Antebrazos', muscles: ['Hombros', 'Core / Abdomen', 'Antebrazos'] },
      { name: 'Cuádriceps y Pantorrillas', focus: 'Cuádriceps, Pantorrillas', muscles: ['Cuádriceps', 'Pantorrillas'] },
      { name: 'Glúteos e Isquiotibiales', focus: 'Glúteos, Isquiotibiales', muscles: ['Glúteos', 'Isquiotibiales', 'Core / Abdomen'] },
    ],
  },
  6: {
    days: [
      { name: 'Empuje A (Push)', focus: 'Pecho, Hombros, Tríceps', muscles: ['Pecho', 'Hombros', 'Tríceps'] },
      { name: 'Tirón A (Pull)', focus: 'Espalda, Bíceps', muscles: ['Espalda', 'Bíceps', 'Antebrazos'] },
      { name: 'Piernas A', focus: 'Cuádriceps, Glúteos', muscles: ['Cuádriceps', 'Glúteos', 'Core / Abdomen'] },
      { name: 'Empuje B (Push)', focus: 'Pecho, Hombros, Tríceps', muscles: ['Pecho', 'Hombros', 'Tríceps'] },
      { name: 'Tirón B (Pull)', focus: 'Espalda, Bíceps', muscles: ['Espalda', 'Bíceps', 'Antebrazos'] },
      { name: 'Piernas B', focus: 'Isquiotibiales, Pantorrillas', muscles: ['Isquiotibiales', 'Pantorrillas', 'Core / Abdomen'] },
    ],
  },
};

interface SetsRepsConfig {
  sets: number;
  reps: string;
  rest: string;
  rpe: number;
}

function getVolumeConfig(objective: Objective, level: TrainingLevel, isCompound: boolean): SetsRepsConfig {
  const configs: Record<Objective, Record<TrainingLevel, { compound: SetsRepsConfig; isolation: SetsRepsConfig }>> = {
    strength: {
      beginner:     { compound: { sets: 3, reps: '5', rest: '3 min', rpe: 7 },     isolation: { sets: 2, reps: '8', rest: '90s', rpe: 6 } },
      intermediate: { compound: { sets: 4, reps: '4-6', rest: '3-4 min', rpe: 8 }, isolation: { sets: 3, reps: '8-10', rest: '2 min', rpe: 7 } },
      advanced:     { compound: { sets: 5, reps: '3-5', rest: '4-5 min', rpe: 9 }, isolation: { sets: 3, reps: '6-8', rest: '2 min', rpe: 8 } },
      elite:        { compound: { sets: 5, reps: '1-3', rest: '5 min', rpe: 10 },  isolation: { sets: 4, reps: '6', rest: '2 min', rpe: 9 } },
    },
    hypertrophy: {
      beginner:     { compound: { sets: 3, reps: '10-12', rest: '90s', rpe: 7 },   isolation: { sets: 3, reps: '12-15', rest: '60s', rpe: 7 } },
      intermediate: { compound: { sets: 4, reps: '8-12', rest: '90s', rpe: 8 },    isolation: { sets: 3, reps: '12-15', rest: '60s', rpe: 8 } },
      advanced:     { compound: { sets: 4, reps: '6-10', rest: '2 min', rpe: 8 },  isolation: { sets: 4, reps: '10-15', rest: '60s', rpe: 8 } },
      elite:        { compound: { sets: 5, reps: '6-10', rest: '2 min', rpe: 9 },  isolation: { sets: 4, reps: '12-20', rest: '45s', rpe: 9 } },
    },
    weight_loss: {
      beginner:     { compound: { sets: 3, reps: '15', rest: '45s', rpe: 6 },      isolation: { sets: 2, reps: '15-20', rest: '30s', rpe: 6 } },
      intermediate: { compound: { sets: 3, reps: '12-15', rest: '45s', rpe: 7 },   isolation: { sets: 3, reps: '15-20', rest: '30s', rpe: 7 } },
      advanced:     { compound: { sets: 4, reps: '12-15', rest: '45s', rpe: 7 },   isolation: { sets: 3, reps: '15-20', rest: '30s', rpe: 7 } },
      elite:        { compound: { sets: 4, reps: '15-20', rest: '30s', rpe: 8 },   isolation: { sets: 3, reps: '20', rest: '30s', rpe: 8 } },
    },
    endurance: {
      beginner:     { compound: { sets: 2, reps: '15-20', rest: '30s', rpe: 5 },   isolation: { sets: 2, reps: '20', rest: '30s', rpe: 5 } },
      intermediate: { compound: { sets: 3, reps: '15-20', rest: '30s', rpe: 6 },   isolation: { sets: 2, reps: '20', rest: '30s', rpe: 6 } },
      advanced:     { compound: { sets: 3, reps: '20-25', rest: '30s', rpe: 7 },   isolation: { sets: 3, reps: '20', rest: '30s', rpe: 7 } },
      elite:        { compound: { sets: 4, reps: '20+', rest: '30s', rpe: 7 },     isolation: { sets: 3, reps: '25+', rest: '30s', rpe: 7 } },
    },
    athletic: {
      beginner:     { compound: { sets: 3, reps: '6-8', rest: '2 min', rpe: 7 },   isolation: { sets: 3, reps: '10-12', rest: '90s', rpe: 7 } },
      intermediate: { compound: { sets: 4, reps: '4-6', rest: '2 min', rpe: 8 },   isolation: { sets: 3, reps: '8-12', rest: '90s', rpe: 7 } },
      advanced:     { compound: { sets: 4, reps: '3-5', rest: '2-3 min', rpe: 8 }, isolation: { sets: 3, reps: '8-10', rest: '90s', rpe: 8 } },
      elite:        { compound: { sets: 5, reps: '2-5', rest: '3 min', rpe: 9 },   isolation: { sets: 3, reps: '8', rest: '90s', rpe: 8 } },
    },
    toning: {
      beginner:     { compound: { sets: 3, reps: '12-15', rest: '60s', rpe: 6 },   isolation: { sets: 2, reps: '15', rest: '45s', rpe: 6 } },
      intermediate: { compound: { sets: 3, reps: '12-15', rest: '60s', rpe: 7 },   isolation: { sets: 3, reps: '15', rest: '45s', rpe: 7 } },
      advanced:     { compound: { sets: 4, reps: '12-15', rest: '60s', rpe: 7 },   isolation: { sets: 3, reps: '15-20', rest: '45s', rpe: 7 } },
      elite:        { compound: { sets: 4, reps: '15', rest: '45s', rpe: 8 },      isolation: { sets: 3, reps: '20', rest: '45s', rpe: 8 } },
    },
    health: {
      beginner:     { compound: { sets: 2, reps: '12-15', rest: '60s', rpe: 5 },   isolation: { sets: 2, reps: '15', rest: '60s', rpe: 5 } },
      intermediate: { compound: { sets: 3, reps: '12-15', rest: '60s', rpe: 6 },   isolation: { sets: 2, reps: '15', rest: '60s', rpe: 6 } },
      advanced:     { compound: { sets: 3, reps: '10-15', rest: '60s', rpe: 7 },   isolation: { sets: 3, reps: '15', rest: '60s', rpe: 7 } },
      elite:        { compound: { sets: 3, reps: '10-15', rest: '60s', rpe: 7 },   isolation: { sets: 3, reps: '15', rest: '60s', rpe: 7 } },
    },
  };
  return isCompound ? configs[objective][level].compound : configs[objective][level].isolation;
}

const COMPOUND_EXERCISES: string[] = [
  'Press de Banca Plano', 'Press de Banca Inclinado', 'Fondos en Paralelas (Pecho)',
  'Dominadas Pronadas', 'Dominadas Supinas (Chin-Up)', 'Remo con Barra Pronado', 'Peso Muerto Convencional',
  'Press Militar con Barra', 'Press Arnold',
  'Sentadilla Trasera', 'Sentadilla Frontal', 'Hip Thrust con Barra', 'Peso Muerto Rumano',
  'Zancadas / Lunges con Mancuernas', 'Clean & Jerk', 'Snatch', 'Power Clean', 'Thruster',
  'Burpees', 'Kettlebell Swing',
];

function isCompoundExercise(name: string): boolean {
  return COMPOUND_EXERCISES.some(c => name.includes(c.split(' ')[0]) || c.includes(name.split(' ')[0]));
}

const EQUIPMENT_FILTER: Record<AvailableEquipment, string[]> = {
  full_gym: ['Sin Equipo', 'Barra', 'Mancuernas', 'Kettlebell', 'Máquina', 'Cable', 'TRX / Suspensión', 'Bandas Elásticas', 'Pelota Medicinal', 'Caja / Plataforma', 'Banco', 'Bicicleta', 'Cinta de Correr', 'Remo / Ergómetro'],
  home_advanced: ['Sin Equipo', 'Mancuernas', 'Kettlebell', 'TRX / Suspensión', 'Bandas Elásticas', 'Pelota Medicinal', 'Caja / Plataforma', 'Banco'],
  home_basic: ['Sin Equipo', 'Mancuernas', 'Bandas Elásticas'],
  outdoor: ['Sin Equipo', 'Bandas Elásticas', 'Caja / Plataforma'],
};

function getExercisesForMuscle(muscle: string, equipment: AvailableEquipment, count: number): Exercise[] {
  const allowed = EQUIPMENT_FILTER[equipment];
  const pool = EXERCISES_DB.filter(
    e => e.muscleGroup === muscle && allowed.includes(e.equipment || 'Sin Equipo')
  );
  // Prioritize compound exercises first
  const compounds = pool.filter(e => isCompoundExercise(e.name));
  const isolations = pool.filter(e => !isCompoundExercise(e.name));
  return [...compounds, ...isolations].slice(0, count);
}

function buildWorkoutExercise(ex: Exercise, config: SetsRepsConfig): WorkoutExercise {
  const sets: WorkoutSet[] = Array.from({ length: config.sets }, () => ({
    id: generateId(),
    sets: 1,
    reps: config.reps,
    rest: config.rest,
    rpe: config.rpe,
  }));
  return { id: generateId(), exercise: ex, sets, order: 0, notes: '' };
}

function generatePlan(data: WizardData): TrainingPlan {
  const { objective, level, daysPerWeek, equipment, includeCardio, includeMobility, planName, planDuration } = data;
  if (!objective || !level || !equipment) throw new Error('Datos incompletos');

  const splitConfig = SPLIT_CONFIGS[daysPerWeek] || SPLIT_CONFIGS[4];
  const exercisesPerMuscle = level === 'beginner' ? 2 : level === 'intermediate' ? 3 : 4;

  const weeks: PlanWeek[] = Array.from({ length: planDuration }, (_, weekIdx) => {
    const days: WorkoutDay[] = splitConfig.days.map((dayConfig, dayIdx) => {
      const workoutExercises: WorkoutExercise[] = [];
      let order = 0;

      dayConfig.muscles.forEach(muscle => {
        const exCount = ['Core / Abdomen', 'Pantorrillas', 'Antebrazos', 'Movilidad / Flexibilidad'].includes(muscle) ? 2 : exercisesPerMuscle;
        const exercises = getExercisesForMuscle(muscle, equipment as AvailableEquipment, exCount);
        exercises.forEach(ex => {
          const isCompound = isCompoundExercise(ex.name);
          const config = getVolumeConfig(objective as Objective, level as TrainingLevel, isCompound);
          const we = buildWorkoutExercise(ex, config);
          we.order = order++;
          workoutExercises.push(we);
        });
      });

      // Add cardio if requested
      if (includeCardio && (dayIdx === 0 || dayIdx === 2)) {
        const cardioExercises = getExercisesForMuscle('Cardio', equipment as AvailableEquipment, 1);
        cardioExercises.forEach(ex => {
          const we = buildWorkoutExercise(ex, { sets: 1, reps: '20-30 min', rest: '-', rpe: 7 });
          we.order = order++;
          workoutExercises.push(we);
        });
      }

      // Add mobility if requested
      if (includeMobility && dayIdx === splitConfig.days.length - 1) {
        const mobilityExercises = getExercisesForMuscle('Movilidad / Flexibilidad', equipment as AvailableEquipment, 3);
        mobilityExercises.forEach(ex => {
          const we = buildWorkoutExercise(ex, { sets: 1, reps: '30-60 seg', rest: '30s', rpe: 3 });
          we.order = order++;
          workoutExercises.push(we);
        });
      }

      return {
        id: generateId(),
        name: dayConfig.name,
        dayNumber: dayIdx + 1,
        focus: dayConfig.focus,
        exercises: workoutExercises,
        notes: weekIdx === 0 ? 'Semana de adaptación: prioriza la técnica sobre el peso' : '',
        isRestDay: false,
        duration: data.sessionDuration,
      };
    });

    return { id: generateId(), weekNumber: weekIdx + 1, days, notes: '' };
  });

  return {
    id: generateId(),
    trainerId: '',
    name: planName || `Plan ${OBJECTIVE_LABELS[objective as Objective]} - ${LEVEL_LABELS[level as TrainingLevel]}`,
    description: `Plan generado automáticamente para ${OBJECTIVE_LABELS[objective as Objective].toLowerCase()} con nivel ${LEVEL_LABELS[level as TrainingLevel].toLowerCase()}. ${daysPerWeek} días por semana, sesiones de ${data.sessionDuration} minutos.`,
    objective: OBJECTIVE_LABELS[objective as Objective],
    level: level as TrainingLevel,
    duration: planDuration,
    daysPerWeek,
    sport: 'General',
    weeks,
    tags: [OBJECTIVE_LABELS[objective as Objective], LEVEL_LABELS[level as TrainingLevel], `${daysPerWeek} días/semana`],
    isTemplate: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Constantes de etiquetas ───────────────────────────────────────────────────
const OBJECTIVE_LABELS: Record<Objective, string> = {
  strength: 'Fuerza Máxima',
  hypertrophy: 'Hipertrofia Muscular',
  weight_loss: 'Pérdida de Peso',
  endurance: 'Resistencia',
  athletic: 'Rendimiento Deportivo',
  toning: 'Tonificación',
  health: 'Salud General',
};

const LEVEL_LABELS: Record<TrainingLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  elite: 'Élite',
};

// ── Componente principal ──────────────────────────────────────────────────────
export const AutoPlanGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { addPlan } = useStore();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');

  const totalSteps = 6;

  const update = <K extends keyof WizardData>(key: K, value: WizardData[K]) =>
    setData(d => ({ ...d, [key]: value }));

  const toggleArray = (key: 'focusMuscles' | 'injuries', val: string) => {
    setData(d => ({
      ...d,
      [key]: d[key].includes(val) ? d[key].filter(v => v !== val) : [...d[key], val],
    }));
  };

  const handleGenerate = () => {
    setError('');
    try {
      const plan = generatePlan(data);
      addPlan({
        trainerId: '',
        name: plan.name,
        description: plan.description,
        objective: plan.objective,
        level: plan.level,
        duration: plan.duration,
        daysPerWeek: plan.daysPerWeek,
        sport: plan.sport,
        weeks: plan.weeks,
        tags: plan.tags,
        isTemplate: false,
      });
      setGenerated(true);
    } catch (e) {
      setError('Error al generar el plan. Asegúrate de completar todos los pasos.');
    }
  };

  // Validaciones por paso
  const canProceed = (): boolean => {
    if (step === 0) return data.objective !== '';
    if (step === 1) return data.level !== '';
    if (step === 2) return data.daysPerWeek >= 2;
    if (step === 3) return data.equipment !== '';
    if (step === 4) return true;
    if (step === 5) return true;
    return true;
  };

  if (generated) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">¡Plan Generado con Éxito!</h2>
          <p className="text-slate-500 mb-2">
            Tu plan <strong>{data.planName || `Plan ${OBJECTIVE_LABELS[data.objective as Objective]}`}</strong> ha sido creado y guardado.
          </p>
          <p className="text-slate-400 text-sm mb-8">
            {data.planDuration} semanas · {data.daysPerWeek} días/semana · {data.sessionDuration} min/sesión
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/plans')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
            >
              Ver Planes
            </button>
            <button
              onClick={() => { setData(INITIAL_WIZARD); setGenerated(false); setStep(0); }}
              className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition"
            >
              Generar Otro
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
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Generador de Planes Automático</h1>
              <p className="text-sm text-slate-500">Responde las preguntas y crea tu plan personalizado</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Paso {step + 1} de {totalSteps}</span>
              <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">

          {/* STEP 0: Objetivo */}
          {step === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Target className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">¿Cuál es tu objetivo principal?</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(OBJECTIVE_LABELS) as [Objective, string][]).map(([key, label]) => {
                  const icons: Record<Objective, React.ReactNode> = {
                    strength: <Zap className="w-5 h-5" />,
                    hypertrophy: <Dumbbell className="w-5 h-5" />,
                    weight_loss: <TrendingUp className="w-5 h-5" />,
                    endurance: <Heart className="w-5 h-5" />,
                    athletic: <Star className="w-5 h-5" />,
                    toning: <Shield className="w-5 h-5" />,
                    health: <Heart className="w-5 h-5" />,
                  };
                  const descs: Record<Objective, string> = {
                    strength: 'Maximizar la fuerza en movimientos básicos',
                    hypertrophy: 'Aumentar la masa muscular y el volumen',
                    weight_loss: 'Reducir el porcentaje de grasa corporal',
                    endurance: 'Mejorar la capacidad aeróbica y resistencia',
                    athletic: 'Mejorar la potencia, velocidad y agilidad',
                    toning: 'Definir y tonificar el músculo existente',
                    health: 'Mejorar la salud general y calidad de vida',
                  };
                  return (
                    <button
                      key={key}
                      onClick={() => update('objective', key)}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        data.objective === key
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-100 hover:border-purple-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mt-0.5 ${data.objective === key ? 'text-purple-600' : 'text-slate-400'}`}>
                        {icons[key]}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{descs[key]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1: Nivel */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">¿Cuál es tu nivel de entrenamiento?</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(LEVEL_LABELS) as [TrainingLevel, string][]).map(([key, label]) => {
                  const descs: Record<TrainingLevel, string> = {
                    beginner: 'Menos de 1 año entrenando con regularidad',
                    intermediate: '1-3 años con buenas bases técnicas',
                    advanced: '3-5 años con técnica sólida y periodización',
                    elite: 'Más de 5 años, atleta competitivo',
                  };
                  return (
                    <button
                      key={key}
                      onClick={() => update('level', key)}
                      className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                        data.level === key
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-100 hover:border-purple-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-semibold text-slate-800">{label}</p>
                      <p className="text-xs text-slate-500 mt-1">{descs[key]}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Días y duración */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Calendar className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">Disponibilidad semanal</h2>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Días de entrenamiento por semana: <span className="text-purple-600 font-bold">{data.daysPerWeek}</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[2, 3, 4, 5, 6].map(n => (
                      <button
                        key={n}
                        onClick={() => update('daysPerWeek', n)}
                        className={`w-12 h-12 rounded-xl font-semibold text-lg transition-all ${
                          data.daysPerWeek === n
                            ? 'bg-purple-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-purple-100'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {data.daysPerWeek === 2 && 'División: Tren superior / Tren inferior'}
                    {data.daysPerWeek === 3 && 'División: Push / Pull / Piernas'}
                    {data.daysPerWeek === 4 && 'División: Upper A / Lower A / Upper B / Lower B'}
                    {data.daysPerWeek === 5 && 'División: Pecho-Tríceps / Espalda-Bíceps / Hombros-Core / Cuádriceps / Glúteos-Isquios'}
                    {data.daysPerWeek === 6 && 'División: Push-Pull-Legs x2'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Duración de sesión: <span className="text-purple-600 font-bold">{data.sessionDuration} min</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[30, 45, 60, 75, 90].map(n => (
                      <button
                        key={n}
                        onClick={() => update('sessionDuration', n)}
                        className={`px-4 py-2 rounded-xl font-medium transition-all ${
                          data.sessionDuration === n
                            ? 'bg-purple-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-purple-100'
                        }`}
                      >
                        {n} min
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Duración del plan: <span className="text-purple-600 font-bold">{data.planDuration} semanas</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[4, 6, 8, 12, 16].map(n => (
                      <button
                        key={n}
                        onClick={() => update('planDuration', n)}
                        className={`px-4 py-2 rounded-xl font-medium transition-all ${
                          data.planDuration === n
                            ? 'bg-purple-500 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-purple-100'
                        }`}
                      >
                        {n} sem
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Equipamiento */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Dumbbell className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">¿Con qué equipamiento cuentas?</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: 'full_gym', label: 'Gimnasio Completo', desc: 'Máquinas, barras, mancuernas, cables, todo disponible' },
                  { key: 'home_advanced', label: 'Casa Avanzado', desc: 'Mancuernas, kettlebells, TRX, bandas, banco' },
                  { key: 'home_basic', label: 'Casa Básico', desc: 'Solo mancuernas y bandas elásticas' },
                  { key: 'outdoor', label: 'Exterior / Calistenia', desc: 'Sin equipo, barras de parque, resistencia corporal' },
                ] as { key: AvailableEquipment; label: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => update('equipment', opt.key)}
                    className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                      data.equipment === opt.key
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-slate-100 hover:border-purple-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-semibold text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Grupos musculares prioritarios y lesiones */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <AlertTriangle className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">Prioridades y limitaciones</h2>
              </div>

              <div className="mb-6">
                <p className="text-sm font-medium text-slate-700 mb-3">Grupos musculares a priorizar (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Core / Abdomen', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas'].map(m => (
                    <button
                      key={m}
                      onClick={() => toggleArray('focusMuscles', m)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        data.focusMuscles.includes(m)
                          ? 'bg-purple-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-purple-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Lesiones o limitaciones a tener en cuenta (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {['Rodilla', 'Hombro', 'Espalda baja', 'Cuello', 'Codo', 'Tobillo', 'Cadera', 'Muñeca'].map(inj => (
                    <button
                      key={inj}
                      onClick={() => toggleArray('injuries', inj)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        data.injuries.includes(inj)
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-red-50'
                      }`}
                    >
                      {inj}
                    </button>
                  ))}
                </div>
                {data.injuries.length > 0 && (
                  <p className="mt-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    Se evitarán ejercicios de alto impacto en las zonas seleccionadas. Consulta siempre a un médico antes de entrenar con lesiones.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Opciones finales y nombre */}
          {step === 5 && (
            <div>
              <div className="flex items-center gap-2 mb-5">
                <CheckCircle2 className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-slate-800">Últimos detalles</h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del plan (opcional)</label>
                  <input
                    type="text"
                    value={data.planName}
                    onChange={e => update('planName', e.target.value)}
                    placeholder={`Plan ${data.objective ? OBJECTIVE_LABELS[data.objective as Objective] : ''} - ${data.level ? LEVEL_LABELS[data.level as TrainingLevel] : ''}`}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => update('includeCardio', !data.includeCardio)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${data.includeCardio ? 'bg-purple-500' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${data.includeCardio ? 'left-7' : 'left-1'}`} />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Incluir cardio</p>
                    <p className="text-xs text-slate-400">Añadir ejercicios de cardio al final de algunas sesiones</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => update('includeMobility', !data.includeMobility)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${data.includeMobility ? 'bg-purple-500' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${data.includeMobility ? 'left-7' : 'left-1'}`} />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Incluir movilidad</p>
                    <p className="text-xs text-slate-400">Añadir ejercicios de movilidad y flexibilidad al último día</p>
                  </div>
                </div>

                {/* Resumen */}
                <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
                  <p className="font-semibold text-slate-700 mb-2">Resumen del plan a generar:</p>
                  <p className="text-slate-600">🎯 Objetivo: <strong>{data.objective ? OBJECTIVE_LABELS[data.objective as Objective] : '-'}</strong></p>
                  <p className="text-slate-600">📊 Nivel: <strong>{data.level ? LEVEL_LABELS[data.level as TrainingLevel] : '-'}</strong></p>
                  <p className="text-slate-600">📅 Días/semana: <strong>{data.daysPerWeek}</strong></p>
                  <p className="text-slate-600">⏱ Duración sesión: <strong>{data.sessionDuration} min</strong></p>
                  <p className="text-slate-600">🗓 Duración plan: <strong>{data.planDuration} semanas</strong></p>
                  <p className="text-slate-600">🏋️ Equipamiento: <strong>{{ full_gym: 'Gimnasio Completo', home_advanced: 'Casa Avanzado', home_basic: 'Casa Básico', outdoor: 'Exterior' }[data.equipment as AvailableEquipment] || '-'}</strong></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

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
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow transition"
            >
              <Wand2 className="w-4 h-4" /> Generar Plan
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
};
