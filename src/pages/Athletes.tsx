import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users, Mail, Phone, Trash2, Eye, Edit3, MessageCircle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, levelBadge, statusBadge } from '../components/ui/Badge';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Input, Select, TextArea } from '../components/ui/Input';
import { useStore } from '../store/useStore';
import type { Athlete } from '../types';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import { PatientInviteModal } from '../components/PatientInviteModal';

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
  { value: 'elite', label: 'Élite' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'other', label: 'Otro' },
];

const emptyAthlete = {
  name: '',
  email: '',
  phone: '',
  sport: '',
  level: '' as Athlete['level'],
  gender: '' as Athlete['gender'],
  birthDate: '',
  weight: undefined as number | undefined,
  height: undefined as number | undefined,
  goals: '',
  medicalNotes: '',
  status: 'active' as Athlete['status'],
};

const AthleteForm: React.FC<{
  initial?: Partial<Athlete>;
  onSave: (data: Omit<Athlete, 'id' | 'trainerId' | 'createdAt'>) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState({ ...emptyAthlete, ...initial });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      sport: form.sport || undefined,
      level: form.level || undefined,
      gender: form.gender || undefined,
      birthDate: form.birthDate || undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      height: form.height ? Number(form.height) : undefined,
      goals: form.goals || undefined,
      medicalNotes: form.medicalNotes || undefined,
      status: form.status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nombre Completo" value={form.name} onChange={set('name')} required placeholder="Nombre y apellido" />
        <Input label="Email" type="email" value={form.email} onChange={set('email')} required placeholder="correo@email.com" />
        <Input label="Teléfono" type="tel" value={form.phone || ''} onChange={set('phone')} placeholder="+34 600 000 000" />
        <Input label="Deporte / Disciplina" value={form.sport || ''} onChange={set('sport')} placeholder="Fútbol, Crossfit..." />
        <Select label="Nivel" value={form.level || ''} onChange={set('level')} options={LEVEL_OPTIONS} placeholder="Selecciona nivel" />
        <Select label="Género" value={form.gender || ''} onChange={set('gender')} options={GENDER_OPTIONS} placeholder="Selecciona" />
        <Input label="Fecha de Nacimiento" type="date" value={form.birthDate || ''} onChange={set('birthDate')} />
        <Select label="Estado" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} />
        <Input label="Peso (kg)" type="number" value={form.weight || ''} onChange={set('weight')} placeholder="75" />
        <Input label="Altura (cm)" type="number" value={form.height || ''} onChange={set('height')} placeholder="178" />
      </div>
      <TextArea label="Objetivos" value={form.goals || ''} onChange={set('goals')} rows={3} placeholder="Objetivos del deportista..." />
      <TextArea label="Notas Médicas / Lesiones" value={form.medicalNotes || ''} onChange={set('medicalNotes')} rows={3} placeholder="Lesiones previas, limitaciones..." />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{initial?.id ? 'Guardar Cambios' : 'Añadir Deportista'}</Button>
      </div>
    </form>
  );
};

export const Athletes: React.FC = () => {
  const { athletes, addAthlete, updateAthlete, deleteAthlete } = useStore();
  const { toasts, removeToast, toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editAthlete, setEditAthlete] = useState<Athlete | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const filtered = athletes.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      (a.sport || '').toLowerCase().includes(search.toLowerCase());
    const matchLevel = !filterLevel || a.level === filterLevel;
    const matchStatus = !filterStatus || a.status === filterStatus;
    return matchSearch && matchLevel && matchStatus;
  });

  const handleSave = (data: Omit<Athlete, 'id' | 'trainerId' | 'createdAt'>) => {
    if (editAthlete) {
      updateAthlete(editAthlete.id, data);
      toast.success('Deportista actualizado correctamente');
    } else {
      addAthlete(data);
      toast.success('Deportista añadido correctamente');
    }
    setShowModal(false);
    setEditAthlete(null);
  };

  const handleDelete = (id: string) => {
    deleteAthlete(id);
    toast.success('Deportista eliminado');
    setDeleteId(null);
  };

  return (
    <Layout>
      <Header
        title="Deportistas"
        subtitle={`${athletes.length} deportistas registrados`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<MessageCircle className="w-4 h-4" />} onClick={() => setShowInviteModal(true)}>
              Invitar Paciente
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditAthlete(null); setShowModal(true); }}>
              Añadir Deportista
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar deportista..."
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
            {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600 mb-2">
              {athletes.length === 0 ? 'Aún no tienes deportistas' : 'Sin resultados'}
            </h3>
            <p className="text-slate-400 mb-6">
              {athletes.length === 0
                ? 'Añade tu primer deportista para empezar'
                : 'Prueba con otros filtros de búsqueda'}
            </p>
            {athletes.length === 0 && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
                Añadir Deportista
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((athlete) => {
              const lvl = levelBadge(athlete.level);
              const st = statusBadge(athlete.status);
              return (
                <Card key={athlete.id} hover className="group">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-sm cursor-pointer"
                      onClick={() => navigate(`/athletes/${athlete.id}`)}
                    >
                      {athlete.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => navigate(`/athletes/${athlete.id}`)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver perfil"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditAthlete(athlete); setShowModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(athlete.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    className="cursor-pointer"
                    onClick={() => navigate(`/athletes/${athlete.id}`)}
                  >
                    <h3 className="font-semibold text-slate-800 mb-0.5 hover:text-blue-600 transition-colors">
                      {athlete.name}
                    </h3>
                    {athlete.sport && (
                      <p className="text-sm text-slate-400 mb-3">{athlete.sport}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <Badge variant={st.variant} size="sm">{st.label}</Badge>
                      {athlete.level && <Badge variant={lvl.variant} size="sm">{lvl.label}</Badge>}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{athlete.email}</span>
                      </div>
                      {athlete.phone && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{athlete.phone}</span>
                        </div>
                      )}
                    </div>

                    {(athlete.weight || athlete.height) && (
                      <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100">
                        {athlete.weight && (
                          <div className="text-center">
                            <p className="text-xs font-semibold text-slate-700">{athlete.weight} kg</p>
                            <p className="text-xs text-slate-400">Peso</p>
                          </div>
                        )}
                        {athlete.height && (
                          <div className="text-center">
                            <p className="text-xs font-semibold text-slate-700">{athlete.height} cm</p>
                            <p className="text-xs text-slate-400">Talla</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditAthlete(null); }}
        title={editAthlete ? `Editar: ${editAthlete.name}` : 'Añadir Deportista'}
        size="lg"
      >
        <AthleteForm
          initial={editAthlete || undefined}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditAthlete(null); }}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="Eliminar Deportista"
        message="¿Estás seguro? Esta acción eliminará al deportista y todas sus asignaciones."
        confirmLabel="Eliminar"
        variant="danger"
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
