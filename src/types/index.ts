export interface User {
  id: string;
  email: string;
  name: string;
  role: 'trainer' | 'admin';
  status?: 'pending' | 'active' | 'suspended';
  avatar?: string;
  phone?: string;
  bio?: string;
  createdAt: string;
}

export interface Athlete {
  id: string;
  trainerId: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  sport?: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  weight?: number;
  height?: number;
  goals?: string;
  medicalNotes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  description?: string;
  muscleGroup: string;
  equipment?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  videoUrl?: string;
  imageUrl?: string;
  instructions?: string[];
  isCustom?: boolean;
  trainerId?: string;
}

export interface WorkoutSet {
  id: string;
  sets: number;
  reps?: string;
  weight?: string;
  duration?: string;
  rest?: string;
  rpe?: number;
  notes?: string;
}

export interface WorkoutExercise {
  id: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  order: number;
  notes?: string;
  supersetGroup?: string;
}

export interface WorkoutDay {
  id: string;
  name: string;
  dayNumber: number;
  focus?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  isRestDay: boolean;
  duration?: number;
}

export interface PlanWeek {
  id: string;
  weekNumber: number;
  days: WorkoutDay[];
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  trainerId: string;
  name: string;
  description?: string;
  objective?: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  duration?: number;
  daysPerWeek?: number;
  sport?: string;
  weeks: PlanWeek[];
  tags?: string[];
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanAssignment {
  id: string;
  planId: string;
  athleteId: string;
  trainerId: string;
  startDate: string;
  endDate?: string;
  status: 'pending' | 'active' | 'completed' | 'paused';
  notes?: string;
  sentAt?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export const MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Antebrazos',
  'Core / Abdomen',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Pantorrillas',
  'Cuerpo Completo',
  'Cardio',
  'Movilidad / Flexibilidad',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT_LIST = [
  'Sin Equipo',
  'Barra',
  'Mancuernas',
  'Kettlebell',
  'Máquina',
  'Cable',
  'TRX / Suspensión',
  'Bandas Elásticas',
  'Pelota Medicinal',
  'Caja / Plataforma',
  'Banco',
  'Bicicleta',
  'Cinta de Correr',
  'Remo / Ergómetro',
] as const;
