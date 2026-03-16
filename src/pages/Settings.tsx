import React, { useState } from 'react';
import { User, Mail, Phone, FileText, Save, Award, Shield, AlertCircle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, TextArea } from '../components/ui/Input';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';

export const Settings: React.FC = () => {
  const { currentUser, updateProfile, athletes, plans, assignments } = useStore();
  const { toasts, removeToast, toast } = useToast();

  const [form, setForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    bio: currentUser?.bio || '',
  });

  const [saving, setSaving] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    updateProfile({
      name: form.name,
      phone: form.phone || undefined,
      bio: form.bio || undefined,
    });
    toast.success('Perfil actualizado correctamente');
    setSaving(false);
  };

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      trainer: currentUser,
      athletes,
      plans,
      assignments,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `APD_SPORT_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Datos exportados correctamente');
  };

  return (
    <Layout>
      <Header title="Configuración" subtitle="Gestiona tu perfil y preferencias" />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              <CardTitle>Perfil de Entrenador</CardTitle>
            </div>
          </CardHeader>

          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-md">
                {form.name.charAt(0).toUpperCase() || 'A'}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{form.name || 'Tu Nombre'}</p>
                <p className="text-sm text-slate-500">{currentUser?.email}</p>
                <p className="text-xs text-blue-600 mt-1">Entrenador Personal · APD SPORT</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nombre Completo"
                value={form.name}
                onChange={set('name')}
                required
                leftIcon={<User className="w-4 h-4" />}
              />
              <Input
                label="Email"
                value={form.email}
                disabled
                leftIcon={<Mail className="w-4 h-4" />}
                hint="El email no puede modificarse"
              />
              <Input
                label="Teléfono"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+34 600 000 000"
                leftIcon={<Phone className="w-4 h-4" />}
              />
            </div>

            <TextArea
              label="Biografía / Especialización"
              value={form.bio}
              onChange={set('bio')}
              rows={3}
              placeholder="Describe tu experiencia y especialización como entrenador..."
            />

            <div className="flex justify-end">
              <Button loading={saving} icon={<Save className="w-4 h-4" />} onClick={handleSave}>
                Guardar Cambios
              </Button>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-500" />
              <CardTitle>Estadísticas de tu Cuenta</CardTitle>
            </div>
          </CardHeader>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Deportistas', value: athletes.length, color: 'from-blue-500 to-blue-600' },
              { label: 'Planes', value: plans.length, color: 'from-indigo-500 to-indigo-600' },
              { label: 'Asignaciones', value: assignments.length, color: 'from-cyan-500 to-cyan-600' },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`bg-gradient-to-br ${stat.color} rounded-2xl p-4 text-white text-center`}
              >
                <p className="text-3xl font-black">{stat.value}</p>
                <p className="text-sm text-white/80 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* APD SPORT Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-500" />
              <CardTitle>APD SPORT Pro Trainer</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Versión</span>
              <span className="text-sm font-semibold text-blue-600">1.0.0</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Plan</span>
              <span className="text-sm font-semibold text-emerald-600">Pro Trainer</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Ejercicios en biblioteca</span>
              <span className="text-sm font-semibold text-slate-700">100+</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-600">Generación de PDF</span>
              <span className="text-sm font-semibold text-emerald-600">✓ Incluido</span>
            </div>
          </div>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <CardTitle>Gestión de Datos</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-slate-700">Exportar mis datos</p>
                <p className="text-xs text-slate-400">Descarga todos tus datos en formato JSON</p>
              </div>
              <Button variant="secondary" size="sm" icon={<FileText className="w-4 h-4" />} onClick={handleExport}>
                Exportar
              </Button>
            </div>
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Almacenamiento Local</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Todos los datos se guardan localmente en tu navegador. Exporta regularmente para hacer copias de seguridad.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Layout>
  );
};
