import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, ClipboardList, Copy, Trash2, Edit3, Eye, FileDown
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, levelBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Modal';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import { generatePlanPDF } from '../lib/pdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const Plans: React.FC = () => {
  const { plans, deletePlan, duplicatePlan, assignments } = useStore();
  const { toasts, removeToast, toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterType, setFilterType] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = plans.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchLevel = !filterLevel || p.level === filterLevel;
    const matchType = !filterType || (filterType === 'template' ? p.isTemplate : !p.isTemplate);
    return matchSearch && matchLevel && matchType;
  });

  const handleDuplicate = (id: string) => {
    duplicatePlan(id);
    toast.success('Plan duplicado correctamente');
  };

  const handleDelete = (id: string) => {
    deletePlan(id);
    toast.success('Plan eliminado');
    setDeleteId(null);
  };

  const handleDownloadPDF = (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    try {
      const doc = generatePlanPDF(plan);
      doc.save(`${plan.name.replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF descargado correctamente');
    } catch {
      toast.error('Error al generar el PDF');
    }
  };

  const getPlanAthleteCount = (planId: string) =>
    assignments.filter((a) => a.planId === planId).length;

  return (
    <Layout>
      <Header
        title="Planes de Entrenamiento"
        subtitle={`${plans.length} planes creados`}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/plans/new')}>
            Nuevo Plan
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar plan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los niveles</option>
            <option value="beginner">Principiante</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzado</option>
            <option value="elite">Élite</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los tipos</option>
            <option value="plan">Planes</option>
            <option value="template">Plantillas</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardList className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600 mb-2">
              {plans.length === 0 ? 'Aún no has creado planes' : 'Sin resultados'}
            </h3>
            <p className="text-slate-400 mb-6">
              {plans.length === 0 ? 'Crea tu primer plan de entrenamiento' : 'Prueba otros filtros'}
            </p>
            {plans.length === 0 && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/plans/new')}>
                Crear Primer Plan
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((plan) => {
              const lvl = levelBadge(plan.level);
              const athleteCount = getPlanAthleteCount(plan.id);
              const totalExercises = plan.weeks.reduce(
                (sum, w) => sum + w.days.reduce((ds, d) => ds + d.exercises.length, 0),
                0
              );

              return (
                <Card key={plan.id} hover className="group flex flex-col">
                  {/* Header color strip */}
                  <div className="h-1.5 -mx-6 -mt-6 mb-5 rounded-t-xl bg-gradient-to-r from-blue-500 to-indigo-500" />

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold text-slate-800 hover:text-blue-600 cursor-pointer truncate transition-colors"
                        onClick={() => navigate(`/plans/${plan.id}`)}
                      >
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => navigate(`/plans/${plan.id}`)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Ver"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => navigate(`/plans/${plan.id}/edit`)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(plan.id)}
                        className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                        title="Duplicar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(plan.id)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        title="Descargar PDF"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(plan.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {plan.level && <Badge variant={lvl.variant} size="sm">{lvl.label}</Badge>}
                    {plan.isTemplate && <Badge variant="cyan" size="sm">Plantilla</Badge>}
                    {plan.sport && <Badge variant="slate" size="sm">{plan.sport}</Badge>}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mt-auto">
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-bold text-slate-700">{plan.weeks.length}</p>
                      <p className="text-xs text-slate-400">Semanas</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-bold text-slate-700">{totalExercises}</p>
                      <p className="text-xs text-slate-400">Ejercicios</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-bold text-slate-700">{athleteCount}</p>
                      <p className="text-xs text-slate-400">Atletas</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      {format(new Date(plan.updatedAt), "d MMM yyyy", { locale: es })}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                    >
                      Ver Plan
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Eliminar Plan"
        message="¿Estás seguro de que quieres eliminar este plan? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
