import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit3, Copy, Trash2, Send, Download, Users,
  ChevronDown, ChevronRight, Dumbbell, Coffee, FileText
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, levelBadge } from '../components/ui/Badge';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Select } from '../components/ui/Input';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import { generatePlanPDF } from '../lib/pdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { WorkoutDay, WorkoutExercise } from '../types';

const ExerciseRow: React.FC<{ exercise: WorkoutExercise }> = ({ exercise }) => (
  <div className="border border-slate-100 rounded-xl overflow-hidden mb-2">
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
      <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
        {exercise.order}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{exercise.exercise.name}</p>
        <p className="text-xs text-slate-400">{exercise.exercise.muscleGroup}</p>
      </div>
      {exercise.exercise.equipment && (
        <Badge variant="slate" size="sm">{exercise.exercise.equipment}</Badge>
      )}
    </div>
    {exercise.sets.length > 0 && (
      <div className="px-4 py-2">
        <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 font-medium mb-1 px-1">
          <span>Serie</span>
          <span>Reps</span>
          <span>Peso</span>
          <span>Descanso</span>
          <span>Notas</span>
        </div>
        {exercise.sets.map((set, i) => (
          <div key={set.id} className="grid grid-cols-5 gap-2 text-xs text-slate-600 py-1 px-1 rounded hover:bg-slate-50">
            <span className="font-medium">{i + 1}</span>
            <span>{set.reps || '-'}</span>
            <span>{set.weight || '-'}</span>
            <span>{set.rest || '-'}</span>
            <span className="text-slate-400 truncate">{set.notes || '-'}</span>
          </div>
        ))}
      </div>
    )}
    {exercise.notes && (
      <div className="px-4 pb-3">
        <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
          💬 {exercise.notes}
        </p>
      </div>
    )}
  </div>
);

const DayCard: React.FC<{ day: WorkoutDay }> = ({ day }) => {
  const [expanded, setExpanded] = useState(!day.isRestDay);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          day.isRestDay ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-blue-50'
        }`}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          day.isRestDay ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {day.dayNumber}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{day.name}</p>
          {day.focus && <p className="text-xs text-slate-400">{day.focus}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {day.isRestDay ? (
            <Badge variant="yellow" size="sm">
              <Coffee className="w-3 h-3" />
              Descanso
            </Badge>
          ) : (
            <Badge variant="blue" size="sm">
              <Dumbbell className="w-3 h-3" />
              {day.exercises.length} ejercicios
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && !day.isRestDay && (
        <div className="p-4 bg-white border-t border-slate-100">
          {day.exercises.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Sin ejercicios en este día</p>
          ) : (
            day.exercises
              .sort((a, b) => a.order - b.order)
              .map((ex) => <ExerciseRow key={ex.id} exercise={ex} />)
          )}
          {day.notes && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
              <span className="font-medium">Notas del día:</span> {day.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const PlanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPlan, duplicatePlan, deletePlan, athletes, assignPlan, assignments } = useStore();
  const { toasts, removeToast, toast } = useToast();

  const plan = getPlan(id!);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [sendMethod, setSendMethod] = useState<'assign' | 'pdf'>('assign');
  const [activeWeek, setActiveWeek] = useState(0);

  if (!plan) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-slate-500">Plan no encontrado.</p>
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/plans')} className="mt-4">
            Volver
          </Button>
        </div>
      </Layout>
    );
  }

  const lvl = levelBadge(plan.level);
  const totalExercises = plan.weeks.reduce(
    (sum, w) => sum + w.days.reduce((ds, d) => ds + d.exercises.length, 0),
    0
  );
  const currentWeek = plan.weeks[activeWeek];

  const handleDuplicate = () => {
    const dup = duplicatePlan(plan.id);
    if (dup) {
      toast.success('Plan duplicado');
      navigate(`/plans/${dup.id}`);
    }
  };

  const handleDelete = () => {
    deletePlan(plan.id);
    toast.success('Plan eliminado');
    navigate('/plans');
  };

  const handleDownloadPDF = () => {
    const athlete = selectedAthleteId ? athletes.find((a) => a.id === selectedAthleteId) : undefined;
    const doc = generatePlanPDF(plan, athlete);
    doc.save(`${plan.name.replace(/\s+/g, '_')}_APD_SPORT.pdf`);
    toast.success('PDF descargado correctamente');
  };

  const handleAssign = () => {
    if (!selectedAthleteId) return;
    assignPlan({
      planId: plan.id,
      athleteId: selectedAthleteId,
      trainerId: plan.trainerId,
      startDate: new Date().toISOString().split('T')[0],
      status: 'active',
    });
    toast.success('Plan asignado al deportista');
    setShowSendModal(false);
    setSelectedAthleteId('');
  };

  const athleteOptions = athletes.map((a) => ({ value: a.id, label: a.name }));
  const assignedAthleteIds = assignments.filter((a) => a.planId === plan.id).map((a) => a.athleteId);

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Back nav */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/plans')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 truncate">{plan.name}</h1>
            <p className="text-slate-500 text-sm">
              Actualizado: {format(new Date(plan.updatedAt), "d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" icon={<Copy className="w-4 h-4" />} onClick={handleDuplicate}>
              Duplicar
            </Button>
            <Button variant="secondary" size="sm" icon={<Edit3 className="w-4 h-4" />} onClick={() => navigate(`/plans/${plan.id}/edit`)}>
              Editar
            </Button>
            <Button size="sm" icon={<Send className="w-4 h-4" />} onClick={() => setShowSendModal(true)}>
              Enviar
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setShowDeleteDialog(true)} />
          </div>
        </div>

        {/* Info bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Semanas', value: plan.weeks.length },
            { label: 'Total Ejercicios', value: totalExercises },
            { label: 'Días/Semana', value: plan.daysPerWeek || '—' },
            { label: 'Atletas', value: assignedAthleteIds.length },
            { label: 'Nivel', value: plan.level ? lvl.label : '—' },
            { label: 'Tipo', value: plan.isTemplate ? 'Plantilla' : 'Plan' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-lg font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {(plan.description || plan.objective) && (
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plan.description && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Descripción</p>
                  <p className="text-sm text-slate-600">{plan.description}</p>
                </div>
              )}
              {plan.objective && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Objetivo</p>
                  <p className="text-sm text-slate-600">{plan.objective}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Week tabs */}
        {plan.weeks.length > 0 && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {plan.weeks.map((week, i) => (
                <button
                  key={week.id}
                  onClick={() => setActiveWeek(i)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeWeek === i
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  Semana {week.weekNumber}
                </button>
              ))}
            </div>

            {currentWeek && (
              <div className="space-y-3">
                {currentWeek.days.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Dumbbell className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p>Esta semana no tiene días programados.</p>
                  </div>
                ) : (
                  currentWeek.days
                    .sort((a, b) => a.dayNumber - b.dayNumber)
                    .map((day) => <DayCard key={day.id} day={day} />)
                )}
              </div>
            )}
          </div>
        )}

        {plan.weeks.length === 0 && (
          <Card className="text-center py-12">
            <Dumbbell className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 mb-4">Este plan no tiene contenido todavía</p>
            <Button icon={<Edit3 className="w-4 h-4" />} onClick={() => navigate(`/plans/${plan.id}/edit`)}>
              Añadir Contenido
            </Button>
          </Card>
        )}
      </div>

      {/* Send Modal */}
      <Modal isOpen={showSendModal} onClose={() => setShowSendModal(false)} title="Enviar Plan" size="sm">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSendMethod('assign')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                sendMethod === 'assign' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Users className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Asignar a Atleta</p>
              <p className="text-xs text-slate-400">Vincula el plan a un deportista</p>
            </button>
            <button
              onClick={() => setSendMethod('pdf')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                sendMethod === 'pdf' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FileText className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Descargar PDF</p>
              <p className="text-xs text-slate-400">Genera un PDF para compartir</p>
            </button>
          </div>

          <Select
            label="Seleccionar Deportista (opcional)"
            value={selectedAthleteId}
            onChange={(e) => setSelectedAthleteId(e.target.value)}
            options={athleteOptions}
            placeholder="Selecciona un deportista..."
          />

          {sendMethod === 'assign' ? (
            <Button className="w-full" onClick={handleAssign} disabled={!selectedAthleteId} icon={<Users className="w-4 h-4" />}>
              Asignar Plan
            </Button>
          ) : (
            <Button className="w-full" onClick={handleDownloadPDF} icon={<Download className="w-4 h-4" />}>
              Descargar PDF
            </Button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Eliminar Plan"
        message={`¿Estás seguro de que quieres eliminar "${plan.name}"?`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
