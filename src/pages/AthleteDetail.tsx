import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, Calendar,
  Target, AlertCircle, ClipboardList, Plus, Edit3, Send
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, levelBadge, statusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Input';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import { format, differenceInYears } from 'date-fns';
import { es } from 'date-fns/locale';

export const AthleteDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAthlete, plans, assignPlan, getAthleteAssignments, getPlan } = useStore();
  const { toasts, removeToast, toast } = useToast();

  const athlete = getAthlete(id!);
  const athleteAssignments = getAthleteAssignments(id!);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  if (!athlete) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-slate-500">Deportista no encontrado.</p>
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/athletes')} className="mt-4">
            Volver
          </Button>
        </div>
      </Layout>
    );
  }

  const lvl = levelBadge(athlete.level);
  const st = statusBadge(athlete.status);
  const age = athlete.birthDate ? differenceInYears(new Date(), new Date(athlete.birthDate)) : null;

  const handleAssign = () => {
    if (!selectedPlanId) return;
    assignPlan({
      planId: selectedPlanId,
      athleteId: athlete.id,
      trainerId: athlete.trainerId,
      startDate,
      status: 'active',
    });
    toast.success('Plan asignado correctamente');
    setShowAssignModal(false);
    setSelectedPlanId('');
  };

  const planOptions = plans.map((p) => ({ value: p.id, label: p.name }));

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Back + Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/athletes')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{athlete.name}</h1>
            <p className="text-slate-500 text-sm">{athlete.sport || 'Deportista'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1">
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl flex items-center justify-center text-white font-black text-4xl mx-auto mb-4 shadow-lg">
                {athlete.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">{athlete.name}</h2>
              {athlete.sport && <p className="text-slate-500 text-sm mb-3">{athlete.sport}</p>}
              <div className="flex justify-center gap-2">
                <Badge variant={st.variant}>{st.label}</Badge>
                {athlete.level && <Badge variant={lvl.variant}>{lvl.label}</Badge>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm text-slate-600 truncate">{athlete.email}</span>
              </div>
              {athlete.phone && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-slate-600">{athlete.phone}</span>
                </div>
              )}
              {athlete.birthDate && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-slate-600">
                    {format(new Date(athlete.birthDate), 'd MMM yyyy', { locale: es })} ({age} años)
                  </span>
                </div>
              )}
            </div>

            {/* Stats */}
            {(athlete.weight || athlete.height) && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {athlete.weight && (
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{athlete.weight}</p>
                    <p className="text-xs text-blue-500 font-medium">kg peso</p>
                  </div>
                )}
                {athlete.height && (
                  <div className="bg-indigo-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-indigo-700">{athlete.height}</p>
                    <p className="text-xs text-indigo-500 font-medium">cm talla</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" icon={<Edit3 className="w-3.5 h-3.5" />} className="flex-1" onClick={() => navigate('/athletes')}>
                Editar
              </Button>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} className="flex-1" onClick={() => setShowAssignModal(true)}>
                Asignar Plan
              </Button>
            </div>
          </Card>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Goals */}
            {athlete.goals && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-500" />
                    <CardTitle>Objetivos</CardTitle>
                  </div>
                </CardHeader>
                <p className="text-slate-600 text-sm leading-relaxed">{athlete.goals}</p>
              </Card>
            )}

            {/* Medical notes */}
            {athlete.medicalNotes && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <CardTitle>Notas Médicas / Lesiones</CardTitle>
                  </div>
                </CardHeader>
                <p className="text-slate-600 text-sm leading-relaxed">{athlete.medicalNotes}</p>
              </Card>
            )}

            {/* Assigned Plans */}
            <Card padding="none">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-blue-500" />
                  <CardTitle>Planes Asignados</CardTitle>
                </div>
                <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAssignModal(true)}>
                  Asignar Plan
                </Button>
              </div>

              {athleteAssignments.length === 0 ? (
                <div className="p-12 text-center">
                  <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sin planes asignados</p>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="mt-2 text-blue-600 text-sm font-medium hover:underline"
                  >
                    Asignar primer plan
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {athleteAssignments.map((assignment) => {
                    const plan = getPlan(assignment.planId);
                    const st2 = statusBadge(assignment.status);
                    return (
                      <div key={assignment.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                            <ClipboardList className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {plan?.name || 'Plan eliminado'}
                            </p>
                            <p className="text-xs text-slate-400">
                              Inicio: {format(new Date(assignment.startDate), 'd MMM yyyy', { locale: es })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={st2.variant}>{st2.label}</Badge>
                          {plan && (
                            <button
                              onClick={() => navigate(`/plans/${plan.id}`)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Ver plan"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Assign Plan Modal */}
      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Asignar Plan de Entrenamiento" size="sm">
        <div className="space-y-4">
          <Select
            label="Seleccionar Plan"
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            options={planOptions}
            placeholder="Selecciona un plan..."
            required
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de Inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAssignModal(false)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={!selectedPlanId}>Asignar Plan</Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
