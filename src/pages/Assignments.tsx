import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search, Download, Trash2, ChevronRight, Users, ClipboardList } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';

import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Modal';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import { generatePlanPDF } from '../lib/pdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const Assignments: React.FC = () => {
  const { assignments, getAthlete, getPlan, deleteAssignment, updateAssignment } = useStore();
  const { toasts, removeToast, toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = assignments.filter((a) => {
    const athlete = getAthlete(a.athleteId);
    const plan = getPlan(a.planId);
    const matchSearch =
      !search ||
      (athlete?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (plan?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleDownloadPDF = (assignmentId: string) => {
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;
    const plan = getPlan(assignment.planId);
    const athlete = getAthlete(assignment.athleteId);
    if (!plan) return;
    const doc = generatePlanPDF(plan, athlete);
    doc.save(`${plan.name.replace(/\s+/g, '_')}_${athlete?.name.replace(/\s+/g, '_') || 'APD'}.pdf`);
    toast.success('PDF descargado');
  };

  const handleStatusChange = (id: string, status: string) => {
    updateAssignment(id, { status: status as any });
    toast.success('Estado actualizado');
  };

  return (
    <Layout>
      <Header
        title="Asignaciones"
        subtitle={`${assignments.length} asignaciones totales`}
      />

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: assignments.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'Activas', value: assignments.filter((a) => a.status === 'active').length, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { label: 'Pendientes', value: assignments.filter((a) => a.status === 'pending').length, color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'Completadas', value: assignments.filter((a) => a.status === 'completed').length, color: 'bg-slate-50 text-slate-600 border-slate-200' },
          ].map((stat) => (
            <div key={stat.label} className={`border rounded-xl p-4 text-center ${stat.color}`}>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs font-medium mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por deportista o plan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activo</option>
            <option value="pending">Pendiente</option>
            <option value="completed">Completado</option>
            <option value="paused">Pausado</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600 mb-2">
              {assignments.length === 0 ? 'Sin asignaciones' : 'Sin resultados'}
            </h3>
            <p className="text-slate-400 mb-6">
              {assignments.length === 0
                ? 'Asigna planes de entrenamiento a tus deportistas'
                : 'Prueba otros filtros'}
            </p>
            {assignments.length === 0 && (
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" icon={<Users className="w-4 h-4" />} onClick={() => navigate('/athletes')}>
                  Ver Deportistas
                </Button>
                <Button icon={<ClipboardList className="w-4 h-4" />} onClick={() => navigate('/plans')}>
                  Ver Planes
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase">Deportista</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase">Plan</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase">Inicio</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase">Estado</th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((assignment) => {
                    const athlete = getAthlete(assignment.athleteId);
                    const plan = getPlan(assignment.planId);

                    return (
                      <tr key={assignment.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                              {athlete?.name.charAt(0) || '?'}
                            </div>
                            <div>
                              <button
                                onClick={() => athlete && navigate(`/athletes/${athlete.id}`)}
                                className="text-sm font-medium text-slate-800 hover:text-blue-600 transition-colors"
                              >
                                {athlete?.name || 'Deportista eliminado'}
                              </button>
                              <p className="text-xs text-slate-400">{athlete?.sport || athlete?.email || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => plan && navigate(`/plans/${plan.id}`)}
                            className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors flex items-center gap-1"
                          >
                            {plan?.name || 'Plan eliminado'}
                            {plan && <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <p className="text-xs text-slate-400">
                            {plan?.weeks.length || 0} semanas
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-600">
                            {format(new Date(assignment.startDate), 'd MMM yyyy', { locale: es })}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <select
                            value={assignment.status}
                            onChange={(e) => handleStatusChange(assignment.id, e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="pending">Pendiente</option>
                            <option value="active">Activo</option>
                            <option value="paused">Pausado</option>
                            <option value="completed">Completado</option>
                          </select>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {plan && (
                              <button
                                onClick={() => handleDownloadPDF(assignment.id)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Descargar PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteId(assignment.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) { deleteAssignment(deleteId); toast.success('Asignación eliminada'); }
          setDeleteId(null);
        }}
        title="Eliminar Asignación"
        message="¿Estás seguro de que quieres eliminar esta asignación?"
        confirmLabel="Eliminar"
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
