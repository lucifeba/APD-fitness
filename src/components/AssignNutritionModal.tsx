import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { NutritionPlan } from '../types';
import { X, UserCheck, Flame, Zap, Wheat, Droplet, Calculator, CheckCircle2 } from 'lucide-react';

interface Props {
  plan: NutritionPlan;
  onClose: () => void;
  onAssigned?: () => void;
}

// TDEE calculation based on athlete data
function calculateTDEE(
  weight: number,
  height: number,
  age: number,
  gender: 'male' | 'female' | 'other',
  activityLevel: string
): number {
  // Mifflin-St Jeor BMR
  let bmr: number;
  if (gender === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  }
  const activityFactors: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  return Math.round(bmr * (activityFactors[activityLevel] || 1.55));
}

function getAgeFromBirthDate(birthDate?: string): number {
  if (!birthDate) return 25;
  const birth = new Date(birthDate);
  const today = new Date();
  return today.getFullYear() - birth.getFullYear();
}

export const AssignNutritionModal: React.FC<Props> = ({ plan, onClose, onAssigned }) => {
  const { athletes, currentUser, assignNutritionToAthlete } = useStore();
  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [customCalories, setCustomCalories] = useState(plan.targetCalories);
  const [customProtein, setCustomProtein] = useState(plan.targetProtein);
  const [customCarbs, setCustomCarbs] = useState(plan.targetCarbs);
  const [customFat, setCustomFat] = useState(plan.targetFat);
  const [useAdaptedCalories, setUseAdaptedCalories] = useState(false);
  const [done, setDone] = useState(false);

  const myAthletes = athletes.filter((a) => a.trainerId === currentUser?.id);

  const selectedAthlete = useMemo(
    () => myAthletes.find((a) => a.id === selectedAthleteId),
    [selectedAthleteId, myAthletes]
  );

  // Calculate TDEE when athlete selected
  const calculatedTDEE = useMemo(() => {
    if (!selectedAthlete) return null;
    return calculateTDEE(
      selectedAthlete.weight || 70,
      selectedAthlete.height || 170,
      getAgeFromBirthDate(selectedAthlete.birthDate),
      selectedAthlete.gender || 'male',
      'moderate'
    );
  }, [selectedAthlete]);

  // Adapt macros based on TDEE ratio
  const adaptedMacros = useMemo(() => {
    if (!calculatedTDEE) return null;
    const ratio = calculatedTDEE / plan.targetCalories;
    return {
      calories: calculatedTDEE,
      protein: Math.round(plan.targetProtein * ratio),
      carbs: Math.round(plan.targetCarbs * ratio),
      fat: Math.round(plan.targetFat * ratio),
    };
  }, [calculatedTDEE, plan]);

  const handleAthleteSelect = (athleteId: string) => {
    setSelectedAthleteId(athleteId);
    setUseAdaptedCalories(false);
  };

  const handleUseAdapted = () => {
    if (adaptedMacros) {
      setCustomCalories(adaptedMacros.calories);
      setCustomProtein(adaptedMacros.protein);
      setCustomCarbs(adaptedMacros.carbs);
      setCustomFat(adaptedMacros.fat);
      setUseAdaptedCalories(true);
    }
  };

  const handleUsePlanValues = () => {
    setCustomCalories(plan.targetCalories);
    setCustomProtein(plan.targetProtein);
    setCustomCarbs(plan.targetCarbs);
    setCustomFat(plan.targetFat);
    setUseAdaptedCalories(false);
  };

  const handleAssign = () => {
    if (!selectedAthleteId) return;
    assignNutritionToAthlete(
      plan.id,
      selectedAthleteId,
      customCalories,
      customProtein,
      customCarbs,
      customFat
    );
    setDone(true);
    setTimeout(() => {
      onAssigned?.();
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Asignar Plan Nutricional</h2>
              <p className="text-xs text-slate-400 truncate max-w-56">{plan.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-800">Plan asignado correctamente</p>
            <p className="text-sm text-slate-500 mt-1">El deportista podrá ver su plan nutricional en su perfil.</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Select athlete */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Selecciona el deportista</label>
              {myAthletes.length === 0 ? (
                <p className="text-sm text-slate-400">No tienes deportistas registrados aún.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {myAthletes.map((athlete) => (
                    <button
                      key={athlete.id}
                      type="button"
                      onClick={() => handleAthleteSelect(athlete.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${
                        selectedAthleteId === athlete.id
                          ? 'border-green-500 bg-green-50'
                          : 'border-slate-100 hover:border-green-200'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                        {athlete.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{athlete.name}</p>
                        <p className="text-xs text-slate-400 truncate">{athlete.email}</p>
                      </div>
                      {athlete.weight && (
                        <span className="text-xs text-slate-400 flex-shrink-0">{athlete.weight}kg · {athlete.height}cm</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Calorie adaptation */}
            {selectedAthlete && calculatedTDEE && adaptedMacros && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">Adaptación Calórica</p>
                </div>
                <p className="text-xs text-amber-700">
                  TDEE estimado para <strong>{selectedAthlete.name}</strong> ({selectedAthlete.weight || '?'}kg, {selectedAthlete.height || '?'}cm): <strong>{calculatedTDEE} kcal/día</strong>
                </p>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-white rounded-lg p-2">
                    <p className="font-bold text-orange-500">{adaptedMacros.calories}</p>
                    <p className="text-slate-400">kcal</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="font-bold text-blue-500">{adaptedMacros.protein}g</p>
                    <p className="text-slate-400">Prot.</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="font-bold text-amber-500">{adaptedMacros.carbs}g</p>
                    <p className="text-slate-400">Carbs</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="font-bold text-red-400">{adaptedMacros.fat}g</p>
                    <p className="text-slate-400">Grasa</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUseAdapted}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition ${useAdaptedCalories ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                  >
                    Usar calorías adaptadas
                  </button>
                  <button
                    type="button"
                    onClick={handleUsePlanValues}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition ${!useAdaptedCalories ? 'border-slate-400 bg-slate-500 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    Usar valores del plan
                  </button>
                </div>
              </div>
            )}

            {/* Manual macro adjustment */}
            {selectedAthleteId && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-700">Ajuste manual de macros (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Calorías (kcal)', key: 'calories', value: customCalories, setter: setCustomCalories, icon: <Flame className="w-3.5 h-3.5 text-orange-500" />, min: 800, max: 6000 },
                    { label: 'Proteína (g)', key: 'protein', value: customProtein, setter: setCustomProtein, icon: <Zap className="w-3.5 h-3.5 text-blue-500" />, min: 30, max: 400 },
                    { label: 'Carbohidratos (g)', key: 'carbs', value: customCarbs, setter: setCustomCarbs, icon: <Wheat className="w-3.5 h-3.5 text-amber-500" />, min: 0, max: 700 },
                    { label: 'Grasas (g)', key: 'fat', value: customFat, setter: setCustomFat, icon: <Droplet className="w-3.5 h-3.5 text-red-400" />, min: 20, max: 300 },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
                        {field.icon}{field.label}
                      </label>
                      <input
                        type="number"
                        value={field.value}
                        min={field.min}
                        max={field.max}
                        onChange={(e) => field.setter(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleAssign}
              disabled={!selectedAthleteId}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:opacity-40 transition"
            >
              Asignar Plan a {selectedAthlete?.name || 'deportista'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
