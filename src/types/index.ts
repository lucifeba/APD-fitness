export interface User {
  id: string;
  email: string;
  name: string;
  role: 'trainer' | 'admin' | 'athlete';
  status?: 'pending' | 'active' | 'suspended';
  avatar?: string;
  phone?: string;
  bio?: string;
  trainerId?: string; // for athletes: their trainer's id
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
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  anamnesisCompleted?: boolean;
  contractAccepted?: boolean;
  contractAcceptedAt?: string;
}

export interface Exercise {
  id: string;
  name: string;
  description?: string;
  muscleGroup: string;
  equipment?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  videoUrl?: string;
  gifUrl?: string;
  imageUrl?: string;
  instructions?: string[];
  isCustom?: boolean;
  trainerId?: string;
}

// ── PATIENT REGISTRATION ────────────────────────────────────────────────────
export interface PendingPatient {
  token: string;
  trainerId: string;
  prefilledName?: string;
  prefilledEmail?: string;
  phone?: string;
  createdAt: string;
  expiresAt: string;
}

export interface PatientAnamnesis {
  // Basic data
  name: string;
  email: string;
  password: string;
  phone?: string;
  birthDate?: string;
  gender: 'male' | 'female' | 'other';
  weight: number;
  height: number;
  bodyFat?: number;
  // Medical history
  chronicDiseases: string[];
  medications: string;
  surgeries: string;
  familyHistory: string;
  // Nutritional history
  previousDiets: string[];
  eatingDisorders: string;
  supplementsUsed: string[];
  // Lifestyle
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  activityDescription: string;
  sleepHours: number;
  stressLevel: 1 | 2 | 3 | 4 | 5;
  // Dietary preferences
  dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean' | 'other';
  mealsPerDay: number;
  mealSchedule: string;
  cookingSkill: 'none' | 'basic' | 'intermediate' | 'advanced';
  cookingTime: 'minimal' | 'moderate' | 'extensive';
  budget: 'low' | 'medium' | 'high';
  // Restrictions
  allergies: string[];
  intolerances: string[];
  dislikedFoods: string[];
  // Health goals
  goal: 'lose_weight' | 'maintain' | 'gain_muscle' | 'performance' | 'health' | 'other';
  targetWeight?: number;
  motivations: string;
  // GI & habits
  giIssues: string[];
  hydrationLiters: number;
  alcoholFrequency: 'never' | 'rarely' | 'weekly' | 'daily';
  caffeineIntake: 'none' | 'low' | 'moderate' | 'high';
  // Additional notes
  notes: string;
  // Contract
  contractAccepted?: boolean;
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

// ── NUTRITION TYPES ────────────────────────────────────────────────────────
export interface NutritionProfile {
  id: string;
  athleteId?: string;
  trainerId: string;
  // Personal data
  age: number;
  gender: 'male' | 'female';
  weight: number; // kg
  height: number; // cm
  bodyFat?: number; // %
  // Activity & goals
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose_weight' | 'maintain' | 'gain_muscle' | 'performance' | 'health';
  weightGoal?: number; // target kg
  // Dietary preferences
  dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean';
  allergies: string[];
  intolerances: string[];
  dislikedFoods: string[];
  mealsPerDay: 2 | 3 | 4 | 5 | 6;
  budget: 'low' | 'medium' | 'high';
  cookingTime: 'minimal' | 'moderate' | 'extensive';
  // Calculated macros
  tdee?: number; // kcal/day
  targetCalories?: number;
  targetProtein?: number; // g
  targetCarbs?: number; // g
  targetFat?: number; // g
  createdAt: string;
}

export interface FoodItem {
  id: string;
  name: string;
  category: 'protein' | 'carbs' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'legume' | 'nuts' | 'nut_seed' | 'condiment' | 'grain' | 'fish_seafood' | 'beverage' | 'other' | 'snack' | 'breakfast';
  calories: number; // per 100g
  protein: number; // g per 100g
  carbs: number; // g per 100g
  fat: number; // g per 100g
  fiber?: number; // g per 100g
  isSpanish?: boolean;
  season?: ('spring' | 'summer' | 'autumn' | 'winter' | 'all')[];
  dietCompatibility: ('omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean' | 'keto' | 'paleo' | 'gluten_free' | 'lactose_free')[];
}

export interface RecipeIngredient {
  foodId: string;
  foodName: string;
  quantity: number; // grams
}

export interface Recipe {
  id: string;
  name: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  servings: number;
  prepTime: number; // minutes
  cookTime: number; // minutes
  difficulty: 'easy' | 'medium' | 'hard';
  ingredients: RecipeIngredient[];
  instructions: string[];
  // Nutritional info per serving (calculated)
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  dietCompatibility: ('omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean' | 'keto' | 'paleo' | 'gluten_free' | 'lactose_free')[];
  tags: string[];
  isSpanish?: boolean;
  region?: string; // Spanish region if applicable
  budget: 'low' | 'medium' | 'high';
}

export interface MealPlan {
  mealType: 'breakfast' | 'mid_morning' | 'lunch' | 'snack' | 'dinner' | 'pre_workout' | 'post_workout';
  recipeId: string;
  recipeName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayMenu {
  dayNumber: number;
  dayName: string;
  meals: MealPlan[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface NutritionPlan {
  id: string;
  trainerId: string;
  athleteId?: string;
  profileId: string;
  name: string;
  weeks: number;
  days: DayMenu[];
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  notes?: string;
  createdAt: string;
}

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  recipientId: string; // userId who receives this notification
  senderId: string;    // userId who triggered it
  senderName: string;
  type: 'plan_assigned' | 'nutrition_sent' | 'message' | 'feedback_submitted' | 'feedback_request' | 'plan_updated' | 'system';
  title: string;
  body: string;
  read: boolean;
  link?: string; // optional navigation link
  createdAt: string;
}

// ── CHAT ─────────────────────────────────────────────────────────────────────
export type ChatAttachment = {
  name: string;
  type: 'image' | 'pdf' | 'file';
  url: string; // base64 data URL or blob URL
  size: number; // bytes
};

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'trainer' | 'admin' | 'athlete';
  recipientId: string; // 'ALL' for broadcast
  recipientName: string;
  text: string;
  attachments?: ChatAttachment[];
  isSystemMessage?: boolean;
  read: boolean;
  createdAt: string;
}

export interface ChatConversation {
  id: string; // usually `${userId1}_${userId2}` sorted
  participantIds: string[];
  participantNames: string[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

// ── WEEKLY FEEDBACK ───────────────────────────────────────────────────────────
export interface FeedbackQuestion {
  id: string;
  label: string;
  type: 'scale' | 'text' | 'yesno' | 'multiselect';
  options?: string[]; // for multiselect
  min?: number;       // for scale
  max?: number;
}

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { id: 'sleep_quality', label: '¿Cómo valorarías la calidad de tu sueño esta semana? (1=muy malo, 10=excelente)', type: 'scale', min: 1, max: 10 },
  { id: 'sleep_hours', label: '¿Cuántas horas dormiste de media por noche?', type: 'scale', min: 1, max: 12 },
  { id: 'energy_level', label: '¿Cuál fue tu nivel de energía general? (1=agotado, 10=muy activo)', type: 'scale', min: 1, max: 10 },
  { id: 'stress_level', label: '¿Nivel de estrés esta semana? (1=muy bajo, 10=muy alto)', type: 'scale', min: 1, max: 10 },
  { id: 'adherence_training', label: '¿Seguiste el plan de entrenamiento? (1=nada, 10=completamente)', type: 'scale', min: 1, max: 10 },
  { id: 'adherence_nutrition', label: '¿Seguiste el plan nutricional? (1=nada, 10=completamente)', type: 'scale', min: 1, max: 10 },
  { id: 'training_sessions', label: '¿Cuántas sesiones de entrenamiento realizaste?', type: 'scale', min: 0, max: 14 },
  { id: 'muscle_soreness', label: '¿Experimentaste agujetas o dolor muscular? (1=ninguno, 10=muy intenso)', type: 'scale', min: 1, max: 10 },
  { id: 'motivation', label: '¿Cuál fue tu motivación esta semana? (1=muy baja, 10=muy alta)', type: 'scale', min: 1, max: 10 },
  { id: 'hydration', label: '¿Bebiste suficiente agua? (1=muy poco, 10=muy bien)', type: 'scale', min: 1, max: 10 },
  { id: 'digestion', label: '¿Cómo fue tu digestión en general? (1=muy mala, 10=excelente)', type: 'scale', min: 1, max: 10 },
  { id: 'injuries', label: '¿Tuviste alguna lesión o molestia esta semana?', type: 'yesno' },
  { id: 'injury_details', label: 'Si tuviste molestias, descríbelas brevemente', type: 'text' },
  { id: 'diet_difficulties', label: '¿Tuviste dificultades para seguir la dieta?', type: 'multiselect', options: ['Falta de tiempo', 'No me gustó la comida', 'Viajé o comí fuera', 'Coste económico', 'Ansiedad/antojos', 'Náuseas o malestar', 'Ninguna'] },
  { id: 'body_weight', label: '¿Cuánto pesaste esta semana? (kg)', type: 'text' },
  { id: 'mood', label: '¿Cómo describirías tu estado de ánimo general?', type: 'multiselect', options: ['Muy positivo', 'Positivo', 'Neutral', 'Algo bajo', 'Muy bajo', 'Ansioso', 'Irritable'] },
  { id: 'highlights', label: '¿Cuál fue tu mayor logro o punto positivo de la semana?', type: 'text' },
  { id: 'difficulties', label: '¿Cuál fue el mayor desafío o dificultad de la semana?', type: 'text' },
  { id: 'trainer_feedback', label: '¿Hay algo que quieras comentar o preguntar a tu entrenador?', type: 'text' },
];

export interface WeeklyFeedback {
  id: string;
  athleteId: string;
  athleteName: string;
  trainerId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  answers: Record<string, string | number | string[]>;
  submittedAt: string;
  readByTrainer: boolean;
}

// ── SCHEDULED NUTRITION SEND ─────────────────────────────────────────────────
export interface ScheduledNutritionSend {
  id: string;
  nutritionPlanId: string;
  athleteId: string;
  trainerId: string;
  scheduledDate: string; // ISO date string
  sendVia: ('email' | 'app')[];
  sent: boolean;
  sentAt?: string;
  createdAt: string;
}

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
