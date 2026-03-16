import React, { useState } from 'react';
import {
  Users, Shield, Trash2, Plus, X, Eye, EyeOff,
  ChevronDown, ChevronUp, ClipboardList, Dumbbell,
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

export const AdminPanel: React.FC = () => {
  const {
    getAllAccounts, createTrainerAccount, deleteAccount,
    athletes, plans, assignments,
  } = useStore();

  const { toasts, removeToast, toast } = useToast();

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
  const trainerAccounts = accounts.filter((a) => a.user.role === 'trainer');

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
    } else {
      toast.error('El email ya está registrado');
    }
  };

  const handleDelete = (account: StoredAccount) => {
    deleteAccount(account.user.id);
    setConfirmDeleteId(null);
    toast.success(`Cuenta de "${account.user.name}" eliminada`);
  };

  return (
    <Layout>
      <Header
        title="Panel de Administración"
        subtitle={`${trainerAccounts.length} entrenadores registrados`}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            Nuevo Entrenador
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Entrenadores', value: trainerAccounts.length, icon: Users, color: 'blue' },
            { label: 'Deportistas', value: athletes.length, icon: Users, color: 'green' },
            { label: 'Planes', value: plans.length, icon: ClipboardList, color: 'indigo' },
            { label: 'Asignaciones', value: assignments.length, icon: Dumbbell, color: 'violet' },
          ].map((stat) => (
            <Card key={stat.label} className="text-center">
              <p className="text-3xl font-black text-slate-800">{stat.value}</p>
              <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Create trainer form */}
        {showCreate && (
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                Crear Nuevo Entrenador
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Carlos García"
                  required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="entrenador@email.com"
                  required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    required
                    className="w-full px-3 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-3 flex justify-end gap-3 pt-1">
                <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createLoading}>
                  {createLoading ? 'Creando...' : 'Crear Entrenador'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Trainers list */}
        <Card padding="none">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-slate-800">Entrenadores Registrados</h3>
          </div>

          {trainerAccounts.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No hay entrenadores registrados aún</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 text-blue-600 text-sm font-medium hover:underline"
              >
                Crear el primero
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {trainerAccounts.map((account) => {
                const stats = getTrainerStats(account.user.id);
                const isBuiltin = BUILTIN_IDS.includes(account.user.id);
                const isExpanded = expandedUser === account.user.id;

                return (
                  <div key={account.user.id} className="hover:bg-slate-50 transition-colors">
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer"
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
                          {isBuiltin && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full border border-amber-200">
                              Sistema
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{account.user.email}</p>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:flex items-center gap-5 text-center">
                        <div>
                          <p className="font-bold text-slate-700 text-sm">{stats.athletes}</p>
                          <p className="text-xs text-slate-400">Deportistas</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 text-sm">{stats.plans}</p>
                          <p className="text-xs text-slate-400">Planes</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 text-sm">{stats.assignments}</p>
                          <p className="text-xs text-slate-400">Asignaciones</p>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="hidden md:block text-right">
                        <p className="text-xs text-slate-400">
                          {format(new Date(account.user.createdAt), "d MMM yyyy", { locale: es })}
                        </p>
                        <p className="text-xs text-slate-400">Alta</p>
                      </div>

                      {/* Expand chevron */}
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-slate-50 border-t border-slate-100">
                        <div className="pt-4 flex items-center justify-between flex-wrap gap-3">
                          <div className="space-y-1 text-sm text-slate-600">
                            <p><span className="font-medium">Email:</span> {account.user.email}</p>
                            {account.user.phone && (
                              <p><span className="font-medium">Teléfono:</span> {account.user.phone}</p>
                            )}
                            {account.user.bio && (
                              <p><span className="font-medium">Bio:</span> {account.user.bio}</p>
                            )}
                            <p className="text-xs text-slate-400">ID: {account.user.id}</p>
                          </div>

                          {!isBuiltin && (
                            <div className="flex gap-2">
                              {confirmDeleteId === account.user.id ? (
                                <>
                                  <span className="text-sm text-red-600 font-medium self-center mr-2">
                                    ¿Confirmar eliminación?
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                  <button
                                    onClick={() => handleDelete(account)}
                                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Eliminar
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(account.user.id); }}
                                  className="px-3 py-1.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
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
              })}
            </div>
          )}
        </Card>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
