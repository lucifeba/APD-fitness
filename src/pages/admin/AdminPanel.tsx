import React, { useState } from 'react';
import {
  Users, Shield, Trash2, Plus, X, Eye, EyeOff,
  ChevronDown, ChevronUp, ClipboardList,
  CheckCircle, XCircle, Clock, UserX, UserCheck,
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { Header } from '../../components/layout/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../../components/ui/Toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { StoredAccount } from '../../store/useStore';

const BUILTIN_IDS = ['admin-001'];

type Tab = 'pending' | 'trainers';

export const AdminPanel: React.FC = () => {
  const {
    getAllAccounts, createTrainerAccount, deleteAccount,
    approveUser, suspendUser,
    athletes, plans, assignments,
  } = useStore();

  const { toasts, removeToast, toast } = useToast();

  const [tab, setTab] = useState<Tab>('pending');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const accounts = getAllAccounts();
  const pendingAccounts = accounts.filter(
    (a) => a.user.role === 'trainer' && (a.user.status === 'pending' || a.user.status === 'suspended')
  );
  const activeTrainers = accounts.filter(
    (a) => a.user.role === 'trainer' && (!a.user.status || a.user.status === 'active')
  );
  const allTrainers = accounts.filter((a) => a.user.role === 'trainer');

  const getTrainerStats = (trainerId: string) => ({
    athletes: athletes.filter((a) => a.trainerId === trainerId).length,
    plans: plans.filter((p) => p.trainerId === trainerId).length,
    assignments: assignments.filter((a) => a.trainerId === trainerId).length,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return;
    setCreateLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    const ok = createTrainerAccount(newName.trim(), newEmail.trim(), newPassword);
    setCreateLoading(false);
    if (ok) {
      toast.success(`Entrenador "${newName}" creado correctamente`);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setShowCreate(false);
      setTab('trainers');
    } else {
      toast.error('El email ya está registrado');
    }
  };

  const handleApprove = (account: StoredAccount) => {
    approveUser(account.user.id);
    toast.success(`✓ ${account.user.name} aprobado — ya puede acceder`);
  };

  const handleSuspend = (account: StoredAccount) => {
    suspendUser(account.user.id);
    toast.warning(`${account.user.name} suspendido`);
  };

  const handleDelete = (account: StoredAccount) => {
    deleteAccount(account.user.id);
    setConfirmDeleteId(null);
    toast.success(`Cuenta de "${account.user.name}" eliminada`);
  };

  const statusBadge = (status?: string) => {
    if (!status || status === 'active') return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">Activo</span>;
    if (status === 'pending') return <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full border border-amber-200 flex items-center gap-1"><Clock className="w-3 h-3" />Pendiente</span>;
    if (status === 'suspended') return <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full border border-red-200">Suspendido</span>;
    return null;
  };

  const TrainerRow: React.FC<{ account: StoredAccount; showActions?: boolean }> = ({ account, showActions = true }) => {
    const stats = getTrainerStats(account.user.id);
    const isBuiltin = BUILTIN_IDS.includes(account.user.id);
    const isExpanded = expandedUser === account.user.id;

    return (
      <div className="hover:bg-slate-50 transition-colors">
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpandedUser(isExpanded ? null : account.user.id)}
        >
          {/* Avatar */}
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 font-bold text-sm">
              {account.user.name.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-slate-800 text-sm">{account.user.name}</p>
              {statusBadge(account.user.status)}
              {isBuiltin && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full border border-slate-200">Sistema</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">{account.user.email}</p>
          </div>

          {/* Stats — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-4 text-center">
            <div>
              <p className="font-bold text-slate-700 text-sm">{stats.athletes}</p>
              <p className="text-xs text-slate-400">Atletas</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 text-sm">{stats.plans}</p>
              <p className="text-xs text-slate-400">Planes</p>
            </div>
          </div>

          {/* Quick approve/suspend for pending */}
          {showActions && (account.user.status === 'pending' || account.user.status === 'suspended') && (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              {account.user.status === 'pending' && (
                <button
                  onClick={() => handleApprove(account)}
                  className="px-2.5 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 flex items-center gap-1 font-medium"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Aprobar</span>
                </button>
              )}
              {account.user.status === 'suspended' && (
                <button
                  onClick={() => handleApprove(account)}
                  className="px-2.5 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 flex items-center gap-1 font-medium"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reactivar</span>
                </button>
              )}
              <button
                onClick={() => setConfirmDeleteId(account.user.id)}
                className="px-2.5 py-1.5 border border-red-200 text-red-500 text-xs rounded-lg hover:bg-red-50 flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rechazar</span>
              </button>
            </div>
          )}

          <div className="text-slate-400 flex-shrink-0">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
            <div className="pt-4 flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-1 text-sm text-slate-600">
                <p><span className="font-medium">Email:</span> {account.user.email}</p>
                <p><span className="font-medium">Alta:</span> {format(new Date(account.user.createdAt), "d MMM yyyy HH:mm", { locale: es })}</p>
                {account.user.bio && <p><span className="font-medium">Bio:</span> {account.user.bio}</p>}
                <p className="text-xs text-slate-400">ID: {account.user.id}</p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{stats.athletes} deportistas</span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{stats.plans} planes</span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{stats.assignments} asignaciones</span>
                </div>
              </div>

              {!isBuiltin && (
                <div className="flex flex-wrap gap-2">
                  {(!account.user.status || account.user.status === 'active') && (
                    <button
                      onClick={() => handleSuspend(account)}
                      className="px-3 py-1.5 border border-amber-200 text-amber-600 text-sm rounded-lg hover:bg-amber-50 flex items-center gap-1.5"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Suspender
                    </button>
                  )}
                  {account.user.status === 'suspended' && (
                    <button
                      onClick={() => handleApprove(account)}
                      className="px-3 py-1.5 border border-emerald-200 text-emerald-600 text-sm rounded-lg hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Reactivar
                    </button>
                  )}
                  {confirmDeleteId === account.user.id ? (
                    <>
                      <span className="text-sm text-red-600 font-medium self-center">¿Confirmar?</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
                      <button
                        onClick={() => handleDelete(account)}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(account.user.id)}
                      className="px-3 py-1.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar cuenta
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <Header
        title="Panel de Administración"
        subtitle={`${allTrainers.length} entrenadores · ${pendingAccounts.length} pendientes`}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setShowCreate(true); setTab('trainers'); }}>
            <span className="hidden sm:inline">Nuevo Entrenador</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Entrenadores', value: activeTrainers.length, icon: Users, color: 'blue' },
            { label: 'Pendientes', value: pendingAccounts.filter(a => a.user.status === 'pending').length, icon: Clock, color: 'amber' },
            { label: 'Deportistas', value: athletes.length, icon: Users, color: 'green' },
            { label: 'Planes', value: plans.length, icon: ClipboardList, color: 'indigo' },
          ].map((stat) => (
            <Card key={stat.label} className="text-center !p-4">
              <p className="text-2xl sm:text-3xl font-black text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 gap-1">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'pending'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            Solicitudes Pendientes
            {pendingAccounts.filter(a => a.user.status === 'pending').length > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {pendingAccounts.filter(a => a.user.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('trainers')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'trainers'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Shield className="w-4 h-4" />
            Entrenadores Activos
          </button>
        </div>

        {/* Create trainer form */}
        {showCreate && tab === 'trainers' && (
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                Crear Nuevo Entrenador
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Carlos García" required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="entrenador@email.com" required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" minLength={6} required
                    className="w-full px-3 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-3 flex justify-end gap-3">
                <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button type="submit" disabled={createLoading}>{createLoading ? 'Creando...' : 'Crear Entrenador'}</Button>
              </div>
            </form>
          </Card>
        )}

        {/* PENDING TAB */}
        {tab === 'pending' && (
          <Card padding="none">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-slate-800">Solicitudes de Acceso</h3>
              <span className="text-xs text-slate-400 ml-auto">Usuarios que han pedido acceso a la plataforma</span>
            </div>

            {pendingAccounts.length === 0 ? (
              <div className="text-center py-14">
                <CheckCircle className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium">Sin solicitudes pendientes</p>
                <p className="text-slate-400 text-xs mt-1">Todos los usuarios están al día</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingAccounts.map((account) => (
                  <TrainerRow key={account.user.id} account={account} showActions />
                ))}
              </div>
            )}
          </Card>
        )}

        {/* TRAINERS TAB */}
        {tab === 'trainers' && (
          <Card padding="none">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Entrenadores con Acceso</h3>
            </div>

            {activeTrainers.length === 0 ? (
              <div className="text-center py-14">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No hay entrenadores activos aún</p>
                <button onClick={() => setShowCreate(true)} className="mt-4 text-blue-600 text-sm font-medium hover:underline">
                  Crear el primero
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeTrainers.map((account) => (
                  <TrainerRow key={account.user.id} account={account} showActions />
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
