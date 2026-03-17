import React, { useState } from 'react';
import { AthleteLayout } from './AthleteLayout';
import { useStore } from '../../store/useStore';
import { ClipboardList, ChevronDown, ChevronUp, Dumbbell, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ExerciseSchematic } from '../../components/ExerciseSchematic';

export const AthleteMyPlans: React.FC = () => {
  const { currentUser, athletes, plans, assignments } = useStore();
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<any | null>(null);

  const athleteRecord = athletes.find((a) => a.email === currentUser?.email);
  const myAssignments = assignments.filter((a) => a.athleteId === athleteRecord?.id);

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    completed: 'bg-slate-100 text-slate-600',
    paused: 'bg-orange-100 text-orange-700',
  };
  const statusLabels: Record<string, string> = {
    active: 'Activo', pending: 'Pendiente', completed: 'Completado', paused: 'Pausado',
  };

  return (
    <AthleteLayout title="Mi Plan de Entrenamiento" subtitle="Consulta tus planes asignados">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        {myAssignments.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aún no tienes planes asignados</p>
            <p className="text-sm mt-1">Tu entrenador te asignará un plan pronto</p>
          </div>
        )}

        {myAssignments.map((assignment) => {
          const plan = plans.find((p) => p.id === assignment.planId);
          if (!plan) return null;

          return (
            <div key={assignment.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Plan header */}
              <div className="p-5 border-b border-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{plan.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {plan.duration} sem · {plan.daysPerWeek} días/sem
                        {plan.level && ` · ${plan.level}`}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[assignment.status]}`}>
                    {statusLabels[assignment.status]}
                  </span>
                </div>
                {plan.description && (
                  <p className="text-sm text-slate-500 mt-3">{plan.description}</p>
                )}
                {assignment.startDate && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Desde {format(new Date(assignment.startDate), "d MMM yyyy", { locale: es })}
                    {assignment.endDate && ` hasta ${format(new Date(assignment.endDate), "d MMM yyyy", { locale: es })}`}
                  </p>
                )}
                {assignment.notes && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">{assignment.notes}</p>
                )}
              </div>

              {/* Weeks */}
              <div className="divide-y divide-slate-50">
                {plan.weeks.map((week) => {
                  const wKey = `${assignment.id}-w${week.weekNumber}`;
                  const isWExpanded = expandedWeek === wKey;
                  return (
                    <div key={week.id}>
                      <button
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition"
                        onClick={() => setExpandedWeek(isWExpanded ? null : wKey)}
                      >
                        <span className="font-semibold text-slate-700 text-sm">Semana {week.weekNumber}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{week.days.length} días</span>
                          {isWExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>

                      {isWExpanded && (
                        <div className="px-5 pb-4 space-y-2">
                          {week.days.map((day) => {
                            const dKey = `${wKey}-d${day.dayNumber}`;
                            const isDExpanded = expandedDay === dKey;
                            return (
                              <div key={day.id} className="bg-slate-50 rounded-xl overflow-hidden">
                                <button
                                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition"
                                  onClick={() => setExpandedDay(isDExpanded ? null : dKey)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${day.isRestDay ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                      {day.dayNumber}
                                    </div>
                                    <div className="text-left">
                                      <p className="text-sm font-medium text-slate-700">{day.name}</p>
                                      {day.focus && <p className="text-xs text-slate-400">{day.focus}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {day.isRestDay ? (
                                      <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Descanso</span>
                                    ) : (
                                      <span className="text-xs text-slate-400">{day.exercises.length} ejercicios</span>
                                    )}
                                    {isDExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                  </div>
                                </button>

                                {isDExpanded && !day.isRestDay && (
                                  <div className="px-4 pb-4 space-y-3">
                                    {day.exercises.map((we, ei) => (
                                      <div key={we.id} className="bg-white rounded-xl border border-slate-200 p-3">
                                        <button
                                          className="w-full text-left flex items-center gap-3 mb-2"
                                          onClick={() => setSelectedExercise(selectedExercise?.id === we.exercise.id ? null : we.exercise)}
                                        >
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700`}>
                                            {ei + 1}
                                          </div>
                                          <div>
                                            <p className="text-sm font-semibold text-slate-800">{we.exercise.name}</p>
                                            <p className="text-xs text-slate-400">{we.exercise.muscleGroup} · {we.exercise.equipment || 'Sin equipo'}</p>
                                          </div>
                                        </button>

                                        {/* Schematic when expanded */}
                                        {selectedExercise?.id === we.exercise.id && (
                                          <div className="bg-slate-50 rounded-xl mb-2 py-2">
                                            <ExerciseSchematic
                                              muscleGroup={we.exercise.muscleGroup}
                                              exerciseName={we.exercise.name}
                                              gifUrl={we.exercise.gifUrl}
                                              imageUrl={we.exercise.imageUrl}
                                            />
                                            {we.exercise.instructions && we.exercise.instructions.length > 0 && (
                                              <div className="px-4 pb-2">
                                                <p className="text-xs font-semibold text-slate-500 mb-1.5">Instrucciones:</p>
                                                <ol className="space-y-1">
                                                  {we.exercise.instructions.map((inst, i) => (
                                                    <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                                      <span className="text-blue-500 font-bold shrink-0">{i+1}.</span>{inst}
                                                    </li>
                                                  ))}
                                                </ol>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Sets */}
                                        <div className="grid grid-cols-2 gap-1.5">
                                          {we.sets.map((set, si) => (
                                            <div key={set.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs text-slate-600">
                                              <span className="font-medium text-slate-700">Serie {si + 1}:</span>
                                              {set.sets > 0 && ` ${set.sets}×${set.reps || '—'}`}
                                              {set.weight && ` @ ${set.weight}kg`}
                                              {set.duration && ` ${set.duration}`}
                                              {set.rest && ` · ${set.rest} desc.`}
                                            </div>
                                          ))}
                                        </div>
                                        {we.notes && <p className="text-xs text-amber-600 mt-2 italic">{we.notes}</p>}
                                      </div>
                                    ))}
                                    {day.notes && <p className="text-xs text-slate-500 italic px-1">{day.notes}</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AthleteLayout>
  );
};
