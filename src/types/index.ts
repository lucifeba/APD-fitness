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
  category: 'protein' | 'carbs' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'legume' | 'nuts' | 'condiment';
  calories: number; // per 100g
  protein: number; // g per 100g
  carbs: number; // g per 100g
  fat: number; // g per 100g
  fiber?: number; // g per 100g
  isSpanish?: boolean;
  season?: ('spring' | 'summer' | 'autumn' | 'winter' | 'all')[];
  dietCompatibility: ('omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean')[];
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
  dietCompatibility: ('omnivore' | 'vegetarian' | 'vegan' | 'pescetarian' | 'mediterranean')[];
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
