import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Athlete, TrainingPlan, PlanAssignment, Exercise, NutritionProfile, NutritionPlan } from '../types';
import { EXERCISES_DB } from '../data/exercises';

export interface StoredAccount {
  email: string;
  password: string;
  user: User;
}

interface AppState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;

  // Data
  athletes: Athlete[];
  plans: TrainingPlan[];
  assignments: PlanAssignment[];
  customExercises: Exercise[];

  // Auth actions
  login: (email: string, password: string) => 'ok' | 'pending' | 'suspended' | 'invalid';
  logout: () => void;
  register: (name: string, email: string, password: string) => boolean;
  updateProfile: (data: Partial<User>) => void;

  // Admin actions
  getAllAccounts: () => StoredAccount[];
  createTrainerAccount: (name: string, email: string, password: string) => boolean;
  deleteAccount: (userId: string) => void;
  updateAccountUser: (userId: string, data: Partial<User>) => void;
  approveUser: (userId: string) => void;
  suspendUser: (userId: string) => void;

  // Athlete actions
  addAthlete: (athlete: Omit<Athlete, 'id' | 'createdAt' | 'trainerId'>) => Athlete;
  updateAthlete: (id: string, data: Partial<Athlete>) => void;
  deleteAthlete: (id: string) => void;
  getAthlete: (id: string) => Athlete | undefined;

  // Plan actions
  addPlan: (plan: Omit<TrainingPlan, 'id' | 'createdAt' | 'updatedAt'>) => TrainingPlan;
  updatePlan: (id: string, data: Partial<TrainingPlan>) => void;
  deletePlan: (id: string) => void;
  getPlan: (id: string) => TrainingPlan | undefined;
  duplicatePlan: (id: string) => TrainingPlan | undefined;

  // Assignment actions
  assignPlan: (assignment: Omit<PlanAssignment, 'id' | 'createdAt'>) => PlanAssignment;
  updateAssignment: (id: string, data: Partial<PlanAssignment>) => void;
  deleteAssignment: (id: string) => void;
  getAthleteAssignments: (athleteId: string) => PlanAssignment[];

  // Exercise actions
  addCustomExercise: (exercise: Omit<Exercise, 'id'>) => Exercise;
  getAllExercises: () => Exercise[];

  // Nutrition actions
  nutritionProfiles: NutritionProfile[];
  nutritionPlans: NutritionPlan[];
  addNutritionProfile: (profile: Omit<NutritionProfile, 'id'>) => NutritionProfile;
  deleteNutritionProfile: (id: string) => void;
  addNutritionPlan: (plan: Omit<NutritionPlan, 'id'>) => NutritionPlan;
  deleteNutritionPlan: (id: string) => void;
  getNutritionPlan: (id: string) => NutritionPlan | undefined;
}

// Built-in accounts (not stored in localStorage, not deletable)
const BUILTIN_ACCOUNTS: StoredAccount[] = [
  {
    email: 'admin@apdsport.com',
    password: 'Admin2024!',
    user: {
      id: 'admin-001',
      email: 'admin@apdsport.com',
      name: 'Administrador',
      role: 'admin',
      createdAt: new Date(0).toISOString(),
    },
  },
];

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      athletes: [],
      plans: [],
      assignments: [],
      customExercises: [],
      nutritionProfiles: [],
      nutritionPlans: [],

      login: (email, password) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];

        const allAccounts = [...BUILTIN_ACCOUNTS, ...storedAccounts];
        const account = allAccounts.find(
          (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password
        );

        if (!account) return 'invalid';

        const status = account.user.status ?? 'active'; // built-in accounts have no status = active
        if (status === 'pending') return 'pending';
        if (status === 'suspended') return 'suspended';

        set({ currentUser: account.user, isAuthenticated: true });
        return 'ok';
      },

      logout: () => set({ currentUser: null, isAuthenticated: false }),

      register: (name, email, password) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];

        const allAccounts = [...BUILTIN_ACCOUNTS, ...storedAccounts];
        const exists = allAccounts.some(
          (a) => a.email.toLowerCase() === email.toLowerCase()
        );
        if (exists) return false;

        const newUser: User = {
          id: generateId(),
          email,
          name,
          role: 'trainer',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        storedAccounts.push({ email, password, user: newUser });
        localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        // Do NOT set isAuthenticated — user must wait for admin approval
        return true;
      },

      getAllAccounts: () => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        return [...BUILTIN_ACCOUNTS, ...storedAccounts];
      },

      createTrainerAccount: (name, email, password) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const allAccounts = [...BUILTIN_ACCOUNTS, ...storedAccounts];
        const exists = allAccounts.some(
          (a) => a.email.toLowerCase() === email.toLowerCase()
        );
        if (exists) return false;
        const newUser: User = {
          id: generateId(),
          email,
          name,
          role: 'trainer',
          createdAt: new Date().toISOString(),
        };
        storedAccounts.push({ email, password, user: newUser });
        localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        return true;
      },

      deleteAccount: (userId) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const updated = storedAccounts.filter((a) => a.user.id !== userId);
        localStorage.setItem('apd-accounts', JSON.stringify(updated));
        // Also remove their data
        set((state) => ({
          athletes: state.athletes.filter((a) => a.trainerId !== userId),
          plans: state.plans.filter((p) => p.trainerId !== userId),
          assignments: state.assignments.filter((a) => a.trainerId !== userId),
        }));
      },

      updateAccountUser: (userId, data) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const idx = storedAccounts.findIndex((a) => a.user.id === userId);
        if (idx >= 0) {
          storedAccounts[idx].user = { ...storedAccounts[idx].user, ...data };
          localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        }
      },

      approveUser: (userId) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const idx = storedAccounts.findIndex((a) => a.user.id === userId);
        if (idx >= 0) {
          storedAccounts[idx].user = { ...storedAccounts[idx].user, status: 'active' };
          localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        }
      },

      suspendUser: (userId) => {
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const idx = storedAccounts.findIndex((a) => a.user.id === userId);
        if (idx >= 0) {
          storedAccounts[idx].user = { ...storedAccounts[idx].user, status: 'suspended' };
          localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        }
      },

      updateProfile: (data) => {
        const { currentUser } = get();
        if (!currentUser) return;
        const updated = { ...currentUser, ...data };
        set({ currentUser: updated });

        // Update stored account
        const storedAccounts = JSON.parse(
          localStorage.getItem('apd-accounts') || '[]'
        ) as StoredAccount[];
        const idx = storedAccounts.findIndex((a) => a.user.id === currentUser.id);
        if (idx >= 0) {
          storedAccounts[idx].user = updated;
          localStorage.setItem('apd-accounts', JSON.stringify(storedAccounts));
        }
      },

      addAthlete: (data) => {
        const { currentUser } = get();
        const athlete: Athlete = {
          ...data,
          id: generateId(),
          trainerId: currentUser?.id || '',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ athletes: [...state.athletes, athlete] }));
        return athlete;
      },

      updateAthlete: (id, data) => {
        set((state) => ({
          athletes: state.athletes.map((a) => (a.id === id ? { ...a, ...data } : a)),
        }));
      },

      deleteAthlete: (id) => {
        set((state) => ({
          athletes: state.athletes.filter((a) => a.id !== id),
          assignments: state.assignments.filter((a) => a.athleteId !== id),
        }));
      },

      getAthlete: (id) => get().athletes.find((a) => a.id === id),

      addPlan: (data) => {
        const { currentUser } = get();
        const plan: TrainingPlan = {
          ...data,
          id: generateId(),
          trainerId: currentUser?.id || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ plans: [...state.plans, plan] }));
        return plan;
      },

      updatePlan: (id, data) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      deletePlan: (id) => {
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== id),
          assignments: state.assignments.filter((a) => a.planId !== id),
        }));
      },

      getPlan: (id) => get().plans.find((p) => p.id === id),

      duplicatePlan: (id) => {
        const plan = get().getPlan(id);
        if (!plan) return undefined;
        const { currentUser } = get();
        const duplicated: TrainingPlan = {
          ...plan,
          id: generateId(),
          trainerId: currentUser?.id || '',
          name: `${plan.name} (Copia)`,
          isTemplate: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ plans: [...state.plans, duplicated] }));
        return duplicated;
      },

      assignPlan: (data) => {
        const assignment: PlanAssignment = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ assignments: [...state.assignments, assignment] }));
        return assignment;
      },

      updateAssignment: (id, data) => {
        set((state) => ({
          assignments: state.assignments.map((a) => (a.id === id ? { ...a, ...data } : a)),
        }));
      },

      deleteAssignment: (id) => {
        set((state) => ({
          assignments: state.assignments.filter((a) => a.id !== id),
        }));
      },

      getAthleteAssignments: (athleteId) =>
        get().assignments.filter((a) => a.athleteId === athleteId),

      addCustomExercise: (data) => {
        const { currentUser } = get();
        const exercise: Exercise = {
          ...data,
          id: generateId(),
          isCustom: true,
          trainerId: currentUser?.id,
        };
        set((state) => ({ customExercises: [...state.customExercises, exercise] }));
        return exercise;
      },

      getAllExercises: () => {
        const { customExercises } = get();
        return [...EXERCISES_DB, ...customExercises];
      },

      addNutritionProfile: (data) => {
        const { currentUser } = get();
        const profile: NutritionProfile = {
          ...data,
          id: generateId(),
          trainerId: currentUser?.id || '',
        };
        set((state) => ({ nutritionProfiles: [...state.nutritionProfiles, profile] }));
        return profile;
      },

      deleteNutritionProfile: (id) => {
        set((state) => ({
          nutritionProfiles: state.nutritionProfiles.filter((p) => p.id !== id),
          nutritionPlans: state.nutritionPlans.filter((p) => p.profileId !== id),
        }));
      },

      addNutritionPlan: (data) => {
        const { currentUser } = get();
        const plan: NutritionPlan = {
          ...data,
          id: generateId(),
          trainerId: currentUser?.id || '',
        };
        set((state) => ({ nutritionPlans: [...state.nutritionPlans, plan] }));
        return plan;
      },

      deleteNutritionPlan: (id) => {
        set((state) => ({
          nutritionPlans: state.nutritionPlans.filter((p) => p.id !== id),
        }));
      },

      getNutritionPlan: (id) => get().nutritionPlans.find((p) => p.id === id),
    } as AppState),
    {
      name: 'apd-sport-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        athletes: state.athletes,
        plans: state.plans,
        assignments: state.assignments,
        customExercises: state.customExercises,
        nutritionProfiles: state.nutritionProfiles,
        nutritionPlans: state.nutritionPlans,
      }),
    }
  )
);
