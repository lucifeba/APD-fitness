import React, { useState } from 'react';
import { Search, Dumbbell, Plus } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Select, TextArea } from '../components/ui/Input';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import type { Exercise } from '../types';
import { MUSCLE_GROUPS, EQUIPMENT_LIST } from '../types';
import { EXERCISES_DB } from '../data/exercises';

const difficultyColor = (d?: string) => {
  switch (d) {
    case 'easy': return 'green';
    case 'medium': return 'yellow';
    case 'hard': return 'red';
    default: return 'slate';
  }
};

const difficultyLabel = (d?: string) => {
  switch (d) {
    case 'easy': return 'Fácil';
    case 'medium': return 'Medio';
    case 'hard': return 'Difícil';
    default: return 'N/A';
  }
};

const muscleGroupColor: Record<string, string> = {
  'Pecho': 'bg-red-100 text-red-700',
  'Espalda': 'bg-blue-100 text-blue-700',
  'Hombros': 'bg-indigo-100 text-indigo-700',
  'Bíceps': 'bg-orange-100 text-orange-700',
  'Tríceps': 'bg-amber-100 text-amber-700',
  'Core / Abdomen': 'bg-emerald-100 text-emerald-700',
  'Cuádriceps': 'bg-cyan-100 text-cyan-700',
  'Isquiotibiales': 'bg-teal-100 text-teal-700',
  'Glúteos': 'bg-pink-100 text-pink-700',
  'Pantorrillas': 'bg-lime-100 text-lime-700',
  'Cuerpo Completo': 'bg-purple-100 text-purple-700',
  'Cardio': 'bg-rose-100 text-rose-700',
  'Movilidad / Flexibilidad': 'bg-sky-100 text-sky-700',
  'Antebrazos': 'bg-stone-100 text-stone-700',
};

export const Exercises: React.FC = () => {
  const { customExercises, addCustomExercise } = useStore();
  const { toasts, removeToast, toast } = useToast();

  const allExercises = [...EXERCISES_DB, ...customExercises];

  const [search, setSearch] = useState('');
  const [filterMuscle, setFilterMuscle] = useState('');
  const [filterEquipment, setFilterEquipment] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState({
    name: '',
    muscleGroup: '',
    equipment: '',
    difficulty: '',
    description: '',
  });

  const filtered = allExercises.filter((e) => {
    const ms = !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.description || '').toLowerCase().includes(search.toLowerCase());
    const mg = !filterMuscle || e.muscleGroup === filterMuscle;
    const eq = !filterEquipment || e.equipment === filterEquipment;
    const df = !filterDifficulty || e.difficulty === filterDifficulty;
    return ms && mg && eq && df;
  });

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    if (!acc[ex.muscleGroup]) acc[ex.muscleGroup] = [];
    acc[ex.muscleGroup].push(ex);
    return acc;
  }, {});

  const handleAddCustom = () => {
    if (!form.name.trim() || !form.muscleGroup) return;
    addCustomExercise({
      name: form.name,
      muscleGroup: form.muscleGroup,
      equipment: form.equipment || undefined,
      difficulty: form.difficulty as any || undefined,
      description: form.description || undefined,
    });
    toast.success('Ejercicio personalizado añadido');
    setShowAddModal(false);
    setForm({ name: '', muscleGroup: '', equipment: '', difficulty: '', description: '' });
  };

  return (
    <Layout>
      <Header
        title="Biblioteca de Ejercicios"
        subtitle={`${allExercises.length} ejercicios disponibles`}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            Ejercicio Personalizado
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={filterMuscle} onChange={(e) => setFilterMuscle(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Todos los grupos</option>
            {MUSCLE_GROUPS.map((mg) => <option key={mg} value={mg}>{mg}</option>)}
          </select>
          <select value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Todo el equipo</option>
            {EQUIPMENT_LIST.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Toda dificultad</option>
            <option value="easy">Fácil</option>
            <option value="medium">Medio</option>
            <option value="hard">Difícil</option>
          </select>
        </div>

        {/* Quick muscle group pills */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setFilterMuscle('')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !filterMuscle ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
            }`}
          >
            Todos ({allExercises.length})
          </button>
          {MUSCLE_GROUPS.map((mg) => {
            const count = allExercises.filter((e) => e.muscleGroup === mg).length;
            return (
              <button
                key={mg}
                onClick={() => setFilterMuscle(mg === filterMuscle ? '' : mg)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filterMuscle === mg ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                }`}
              >
                {mg} ({count})
              </button>
            );
          })}
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Dumbbell className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400">Sin resultados para tu búsqueda</p>
          </div>
        ) : filterMuscle ? (
          // Single group view - grid
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setSelectedExercise(ex)}
                className="flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm text-left transition-all group"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${muscleGroupColor[ex.muscleGroup] || 'bg-slate-100 text-slate-600'}`}>
                  <Dumbbell className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 truncate">{ex.name}</p>
                  <p className="text-xs text-slate-400 truncate">{ex.equipment || 'Sin equipo'}</p>
                  <div className="flex gap-1 mt-1.5">
                    <Badge variant={difficultyColor(ex.difficulty) as any} size="sm">{difficultyLabel(ex.difficulty)}</Badge>
                    {ex.isCustom && <Badge variant="purple" size="sm">Custom</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Grouped view
          <div className="space-y-6">
            {Object.entries(grouped).map(([muscle, exercises]) => (
              <div key={muscle}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${muscleGroupColor[muscle] || 'bg-slate-100 text-slate-700'}`}>
                    {muscle}
                  </div>
                  <span className="text-sm text-slate-400">{exercises.length} ejercicios</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {exercises.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedExercise(ex)}
                      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-blue-300 hover:shadow-sm text-left transition-all group"
                    >
                      <Dumbbell className="w-4 h-4 text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700 truncate">{ex.name}</p>
                        <p className="text-xs text-slate-400">{ex.equipment || 'Sin equipo'}</p>
                      </div>
                      <Badge variant={difficultyColor(ex.difficulty) as any} size="sm">{difficultyLabel(ex.difficulty)}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exercise detail modal */}
      {selectedExercise && (
        <Modal isOpen={!!selectedExercise} onClose={() => setSelectedExercise(null)} title={selectedExercise.name} size="sm">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-400 mb-0.5">Grupo Muscular</p>
                <p className="text-sm font-semibold text-slate-700">{selectedExercise.muscleGroup}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-400 mb-0.5">Equipo</p>
                <p className="text-sm font-semibold text-slate-700">{selectedExercise.equipment || 'Sin equipo'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant={difficultyColor(selectedExercise.difficulty) as any}>{difficultyLabel(selectedExercise.difficulty)}</Badge>
              {selectedExercise.isCustom && <Badge variant="purple">Ejercicio Custom</Badge>}
            </div>
            {selectedExercise.description && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Descripción</p>
                <p className="text-sm text-slate-600">{selectedExercise.description}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Add custom exercise modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Añadir Ejercicio Personalizado" size="sm">
        <div className="space-y-4">
          <Input label="Nombre del Ejercicio" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Ej: Press Landmine" />
          <Select
            label="Grupo Muscular"
            value={form.muscleGroup}
            onChange={(e) => setForm((p) => ({ ...p, muscleGroup: e.target.value }))}
            options={MUSCLE_GROUPS.map((mg) => ({ value: mg, label: mg }))}
            placeholder="Selecciona..."
            required
          />
          <Select
            label="Equipo"
            value={form.equipment}
            onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))}
            options={EQUIPMENT_LIST.map((eq) => ({ value: eq, label: eq }))}
            placeholder="Selecciona..."
          />
          <Select
            label="Dificultad"
            value={form.difficulty}
            onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
            options={[
              { value: 'easy', label: 'Fácil' },
              { value: 'medium', label: 'Medio' },
              { value: 'hard', label: 'Difícil' },
            ]}
            placeholder="Selecciona..."
          />
          <TextArea label="Descripción" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Descripción del ejercicio..." />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancelar</Button>
            <Button onClick={handleAddCustom} disabled={!form.name || !form.muscleGroup}>Añadir Ejercicio</Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
