import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, ChevronDown, ChevronUp,
  Dumbbell, Coffee, Search, X, GripVertical, Copy
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Input, TextArea, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import type {
  TrainingPlan, PlanWeek, WorkoutDay, WorkoutExercise, WorkoutSet, Exercise,
} from '../types';
import { MUSCLE_GROUPS } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 11);

const emptySet = (): WorkoutSet => ({
  id: generateId(),
  sets: 3,
  reps: '10',
  weight: '',
  rest: '60s',
  notes: '',
});

const emptyDay = (num: number): WorkoutDay => ({
  id: generateId(),
  name: `Día ${num}`,
  dayNumber: num,
  focus: '',
  exercises: [],
  notes: '',
  isRestDay: false,
});

const emptyWeek = (num: number): PlanWeek => ({
  id: generateId(),
  weekNumber: num,
  days: [emptyDay(1), emptyDay(2), emptyDay(3)],
  notes: '',
});

// ─── Exercise Picker Modal ────────────────────────────────────────────────────
const ExercisePicker: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}> = ({ isOpen, onClose, onSelect }) => {
  const { getAllExercises } = useStore();
  const [search, setSearch] = useState('');
  const [filterMuscle, setFilterMuscle] = useState('');
  const allExercises = getAllExercises();

  const filtered = allExercises.filter((e) => {
    const ms = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const mg = !filterMuscle || e.muscleGroup === filterMuscle;
    return ms && mg;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Seleccionar Ejercicio" size="lg">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <select
            value={filterMuscle}
            onChange={(e) => setFilterMuscle(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los grupos</option>
            {MUSCLE_GROUPS.map((mg) => <option key={mg} value={mg}>{mg}</option>)}
          </select>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Sin resultados</p>
          ) : (
            filtered.map((ex) => (
              <button
                key={ex.id}
                onClick={() => { onSelect(ex); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 hover:border-blue-200 border border-transparent text-left transition-all group"
              >
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                  <Dumbbell className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{ex.name}</p>
                  <p className="text-xs text-slate-400">{ex.muscleGroup}{ex.equipment ? ` · ${ex.equipment}` : ''}</p>
                </div>
                {ex.isCustom && <Badge variant="purple" size="sm">Custom</Badge>}
                <Badge variant="slate" size="sm">{ex.difficulty || 'N/A'}</Badge>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

// ─── Set Editor ───────────────────────────────────────────────────────────────
const SetEditor: React.FC<{
  sets: WorkoutSet[];
  onChange: (sets: WorkoutSet[]) => void;
}> = ({ sets, onChange }) => {
  const update = (i: number, field: keyof WorkoutSet, val: string | number) => {
    const updated = [...sets];
    updated[i] = { ...updated[i], [field]: val };
    onChange(updated);
  };

  const remove = (i: number) => onChange(sets.filter((_, idx) => idx !== i));
  const add = () => onChange([...sets, emptySet()]);

  return (
    <div className="mt-2">
      <div className="grid grid-cols-5 gap-1.5 text-xs text-slate-400 font-medium mb-1 px-1">
        <span>Series</span>
        <span>Reps</span>
        <span>Peso</span>
        <span>Descanso</span>
        <span>Notas</span>
      </div>
      {sets.map((set, i) => (
        <div key={set.id} className="grid grid-cols-5 gap-1.5 mb-1.5 items-center">
          <input
            type="number"
            value={set.sets}
            onChange={(e) => update(i, 'sets', Number(e.target.value))}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
            min={1}
          />
          <input
            type="text"
            value={set.reps || ''}
            onChange={(e) => update(i, 'reps', e.target.value)}
            placeholder="8-12"
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={set.weight || ''}
            onChange={(e) => update(i, 'weight', e.target.value)}
            placeholder="60kg / RPE7"
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={set.rest || ''}
            onChange={(e) => update(i, 'rest', e.target.value)}
            placeholder="90s"
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1">
            <input
              type="text"
              value={set.notes || ''}
              onChange={(e) => update(i, 'notes', e.target.value)}
              placeholder="Nota..."
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={() => remove(i)} className="text-slate-300 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> Añadir serie
      </button>
    </div>
  );
};

// ─── Exercise Editor ──────────────────────────────────────────────────────────
const ExerciseEditor: React.FC<{
  exercise: WorkoutExercise;
  onChange: (we: WorkoutExercise) => void;
  onRemove: () => void;
}> = ({ exercise, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-slate-200 rounded-xl bg-white mb-2">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
        <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
          {exercise.order}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{exercise.exercise.name}</p>
          <p className="text-xs text-slate-400">{exercise.exercise.muscleGroup}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={onRemove} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-100">
          <SetEditor
            sets={exercise.sets}
            onChange={(sets) => onChange({ ...exercise, sets })}
          />
          <div className="mt-2">
            <input
              type="text"
              value={exercise.notes || ''}
              onChange={(e) => onChange({ ...exercise, notes: e.target.value })}
              placeholder="Notas del ejercicio (técnica, variantes...)..."
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Day Editor ───────────────────────────────────────────────────────────────
const DayEditor: React.FC<{
  day: WorkoutDay;
  onChange: (day: WorkoutDay) => void;
  onRemove: () => void;
}> = ({ day, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(true);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const addExercise = (exercise: Exercise) => {
    const we: WorkoutExercise = {
      id: generateId(),
      exercise,
      sets: [emptySet()],
      order: day.exercises.length + 1,
    };
    onChange({ ...day, exercises: [...day.exercises, we] });
  };

  const updateExercise = (id: string, updated: WorkoutExercise) => {
    onChange({ ...day, exercises: day.exercises.map((e) => (e.id === id ? updated : e)) });
  };

  const removeExercise = (id: string) => {
    const filtered = day.exercises.filter((e) => e.id !== id);
    onChange({ ...day, exercises: filtered.map((e, i) => ({ ...e, order: i + 1 })) });
  };

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${day.isRestDay ? 'border-amber-200' : 'border-slate-200'}`}>
      {/* Day header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${day.isRestDay ? 'bg-amber-50' : 'bg-slate-50'}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
          day.isRestDay ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {day.dayNumber}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <input
            type="text"
            value={day.name}
            onChange={(e) => onChange({ ...day, name: e.target.value })}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <input
            type="text"
            value={day.focus || ''}
            onChange={(e) => onChange({ ...day, focus: e.target.value })}
            placeholder="Foco (ej. Pecho + Tríceps)"
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={day.isRestDay}
              onChange={(e) => onChange({ ...day, isRestDay: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
              <Coffee className="w-3.5 h-3.5 inline mr-0.5" />Descanso
            </span>
          </label>
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-slate-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={onRemove} className="p-1 text-red-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && !day.isRestDay && (
        <div className="p-4 bg-white">
          {day.exercises
            .sort((a, b) => a.order - b.order)
            .map((ex) => (
              <ExerciseEditor
                key={ex.id}
                exercise={ex}
                onChange={(updated) => updateExercise(ex.id, updated)}
                onRemove={() => removeExercise(ex.id)}
              />
            ))}

          <button
            onClick={() => setShowExercisePicker(true)}
            className="w-full mt-2 py-3 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Añadir Ejercicio
          </button>

          <input
            type="text"
            value={day.notes || ''}
            onChange={(e) => onChange({ ...day, notes: e.target.value })}
            placeholder="Notas del día (calentamiento, instrucciones...)..."
            className="mt-3 w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-500"
          />
        </div>
      )}

      <ExercisePicker
        isOpen={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelect={addExercise}
      />
    </div>
  );
};

// ─── MAIN PLAN BUILDER ────────────────────────────────────────────────────────
export const PlanBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPlan, addPlan, updatePlan } = useStore();
  const { toasts, removeToast, toast } = useToast();
  const isEdit = !!id && id !== 'new';

  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [plan, setPlan] = useState<Omit<TrainingPlan, 'id' | 'createdAt' | 'updatedAt'>>(() => {
    if (isEdit) {
      const existing = getPlan(id!);
      if (existing) return existing;
    }
    return {
      trainerId: '',
      name: '',
      description: '',
      objective: '',
      level: undefined,
      duration: undefined,
      daysPerWeek: undefined,
      sport: '',
      weeks: [emptyWeek(1)],
      tags: [],
      isTemplate: false,
    };
  });

  const [showSettings, setShowSettings] = useState(!isEdit);
  const [saving, setSaving] = useState(false);

  const currentWeek = plan.weeks[activeWeekIdx];

  const updateWeek = (idx: number, updated: PlanWeek) => {
    const weeks = [...plan.weeks];
    weeks[idx] = updated;
    setPlan((p) => ({ ...p, weeks }));
  };

  const addWeek = () => {
    const newWeek = emptyWeek(plan.weeks.length + 1);
    setPlan((p) => ({ ...p, weeks: [...p.weeks, newWeek] }));
    setActiveWeekIdx(plan.weeks.length);
  };

  const removeWeek = (idx: number) => {
    if (plan.weeks.length === 1) return;
    const weeks = plan.weeks.filter((_, i) => i !== idx).map((w, i) => ({ ...w, weekNumber: i + 1 }));
    setPlan((p) => ({ ...p, weeks }));
    if (activeWeekIdx >= weeks.length) setActiveWeekIdx(weeks.length - 1);
  };

  const duplicateWeek = (idx: number) => {
    const toDup = plan.weeks[idx];
    const dup: PlanWeek = {
      ...toDup,
      id: generateId(),
      weekNumber: plan.weeks.length + 1,
      days: toDup.days.map((d) => ({
        ...d,
        id: generateId(),
        exercises: d.exercises.map((e) => ({
          ...e,
          id: generateId(),
          sets: e.sets.map((s) => ({ ...s, id: generateId() })),
        })),
      })),
    };
    const weeks = [...plan.weeks, dup];
    setPlan((p) => ({ ...p, weeks }));
    setActiveWeekIdx(weeks.length - 1);
  };

  const addDayToWeek = () => {
    const days = [...currentWeek.days, emptyDay(currentWeek.days.length + 1)];
    updateWeek(activeWeekIdx, { ...currentWeek, days });
  };

  const updateDay = (dayIdx: number, updated: WorkoutDay) => {
    const days = [...currentWeek.days];
    days[dayIdx] = updated;
    updateWeek(activeWeekIdx, { ...currentWeek, days });
  };

  const removeDay = (dayIdx: number) => {
    const days = currentWeek.days.filter((_, i) => i !== dayIdx).map((d, i) => ({ ...d, dayNumber: i + 1 }));
    updateWeek(activeWeekIdx, { ...currentWeek, days });
  };

  const handleSave = async () => {
    if (!plan.name.trim()) {
      toast.error('El plan necesita un nombre');
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));

    if (isEdit) {
      updatePlan(id!, plan);
      toast.success('Plan actualizado correctamente');
      navigate(`/plans/${id}`);
    } else {
      const created = addPlan(plan);
      toast.success('Plan creado correctamente');
      navigate(`/plans/${created.id}`);
    }
    setSaving(false);
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-200">
          <button
            onClick={() => navigate(isEdit ? `/plans/${id}` : '/plans')}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={plan.name}
              onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nombre del plan..."
              className="text-xl font-bold text-slate-800 bg-transparent focus:outline-none border-b-2 border-transparent focus:border-blue-500 transition-colors w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
              Configuración
            </Button>
            <Button loading={saving} size="sm" icon={<Save className="w-4 h-4" />} onClick={handleSave}>
              {isEdit ? 'Guardar Cambios' : 'Crear Plan'}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Settings panel */}
          {showSettings && (
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
              <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="col-span-2">
                  <TextArea
                    label="Descripción"
                    value={plan.description || ''}
                    onChange={(e) => setPlan((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    placeholder="Describe el plan..."
                  />
                </div>
                <div className="col-span-2">
                  <TextArea
                    label="Objetivo"
                    value={plan.objective || ''}
                    onChange={(e) => setPlan((p) => ({ ...p, objective: e.target.value }))}
                    rows={2}
                    placeholder="Objetivo del plan..."
                  />
                </div>
                <Select
                  label="Nivel"
                  value={plan.level || ''}
                  onChange={(e) => setPlan((p) => ({ ...p, level: e.target.value as any }))}
                  options={[
                    { value: 'beginner', label: 'Principiante' },
                    { value: 'intermediate', label: 'Intermedio' },
                    { value: 'advanced', label: 'Avanzado' },
                    { value: 'elite', label: 'Élite' },
                  ]}
                  placeholder="Selecciona..."
                />
                <div className="space-y-3">
                  <Input
                    label="Deporte"
                    value={plan.sport || ''}
                    onChange={(e) => setPlan((p) => ({ ...p, sport: e.target.value }))}
                    placeholder="Fútbol, Crossfit..."
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plan.isTemplate}
                      onChange={(e) => setPlan((p) => ({ ...p, isTemplate: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-slate-600">Es plantilla</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Week tabs */}
          <div className="px-6 pt-4 pb-0 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto">
            {plan.weeks.map((w, i) => (
              <div key={w.id} className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setActiveWeekIdx(i)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-xl border-b-2 transition-all ${
                    activeWeekIdx === i
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-transparent text-slate-500 hover:text-blue-500'
                  }`}
                >
                  Semana {w.weekNumber}
                </button>
                <div className="flex gap-0.5 mb-0.5">
                  <button
                    onClick={() => duplicateWeek(i)}
                    className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                    title="Duplicar semana"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {plan.weeks.length > 1 && (
                    <button
                      onClick={() => removeWeek(i)}
                      className="p-1 text-slate-300 hover:text-red-400 transition-colors"
                      title="Eliminar semana"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={addWeek}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-medium mb-0.5"
            >
              <Plus className="w-4 h-4" />
              Semana
            </button>
          </div>

          {/* Days */}
          <div className="p-6 max-w-5xl mx-auto space-y-3">
            {currentWeek && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="text"
                    value={currentWeek.notes || ''}
                    onChange={(e) => updateWeek(activeWeekIdx, { ...currentWeek, notes: e.target.value })}
                    placeholder="Notas de la semana (volumen, intensidad, mesociclo...)..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-500"
                  />
                </div>

                {currentWeek.days
                  .sort((a, b) => a.dayNumber - b.dayNumber)
                  .map((day, di) => (
                    <DayEditor
                      key={day.id}
                      day={day}
                      onChange={(updated) => updateDay(di, updated)}
                      onRemove={() => removeDay(di)}
                    />
                  ))}

                <button
                  onClick={addDayToWeek}
                  className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Añadir Día a la Semana {currentWeek.weekNumber}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
