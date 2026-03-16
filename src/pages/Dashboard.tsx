import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ClipboardList,
  BookOpen,
  TrendingUp,
  Plus,
  ChevronRight,
  Award,
  Activity,
  Dumbbell,
  Send,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Card, CardTitle } from '../components/ui/Card';
import { Badge, levelBadge, statusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const StatCard: React.FC<{
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: number;
}> = ({ title, value, subtitle, icon, color, trend }) => (
  <Card className="relative overflow-hidden">
    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-6 translate-x-6 ${color}`} />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <p className="text-3xl font-bold text-slate-800">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">+{trend}% este mes</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
        <div className="text-white">{icon}</div>
      </div>
    </div>
  </Card>
);

export const Dashboard: React.FC = () => {
  const { athletes, plans, assignments, currentUser } = useStore();
  const navigate = useNavigate();

  const activeAthletes = athletes.filter((a) => a.status === 'active').length;
  const activeAssignments = assignments.filter((a) => a.status === 'active').length;
  const recentAthletes = [...athletes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 5);
  const recentPlans = [...plans].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 5);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <Layout>
      <Header
        title="Dashboard"
        subtitle={`${greeting}, ${currentUser?.name?.split(' ')[0]}! 👋`}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/plans/new')}>
            Nuevo Plan
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Deportistas Activos"
            value={activeAthletes}
            subtitle={`${athletes.length} totales`}
            icon={<Users className="w-6 h-6" />}
            color="bg-blue-500"
            trend={12}
          />
          <StatCard
            title="Planes Creados"
            value={plans.length}
            subtitle={`${plans.filter((p) => p.isTemplate).length} plantillas`}
            icon={<ClipboardList className="w-6 h-6" />}
            color="bg-indigo-500"
          />
          <StatCard
            title="Asignaciones Activas"
            value={activeAssignments}
            subtitle={`${assignments.length} totales`}
            icon={<BookOpen className="w-6 h-6" />}
            color="bg-cyan-500"
            trend={8}
          />
          <StatCard
            title="Ejercicios en BD"
            value="100+"
            subtitle="Biblioteca completa"
            icon={<Dumbbell className="w-6 h-6" />}
            color="bg-violet-500"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: <Users className="w-6 h-6" />,
              label: 'Añadir Deportista',
              desc: 'Registra un nuevo atleta',
              color: 'from-blue-500 to-blue-600',
              route: '/athletes',
            },
            {
              icon: <ClipboardList className="w-6 h-6" />,
              label: 'Crear Plan',
              desc: 'Diseña una programación',
              color: 'from-indigo-500 to-indigo-600',
              route: '/plans/new',
            },
            {
              icon: <Send className="w-6 h-6" />,
              label: 'Enviar Plan',
              desc: 'Comparte con tus atletas',
              color: 'from-cyan-500 to-cyan-600',
              route: '/assignments',
            },
            {
              icon: <Activity className="w-6 h-6" />,
              label: 'Ver Progreso',
              desc: 'Monitorea el rendimiento',
              color: 'from-violet-500 to-violet-600',
              route: '/athletes',
            },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.route)}
              className={`bg-gradient-to-br ${action.color} text-white p-5 rounded-2xl text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group`}
            >
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center mb-3 group-hover:bg-white/30 transition-colors">
                {action.icon}
              </div>
              <p className="font-semibold text-sm mb-0.5">{action.label}</p>
              <p className="text-xs text-white/70">{action.desc}</p>
            </button>
          ))}
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Athletes */}
          <Card padding="none">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle>Últimos Deportistas</CardTitle>
                <button
                  onClick={() => navigate('/athletes')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  Ver todos <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {recentAthletes.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No hay deportistas aún</p>
                <button
                  onClick={() => navigate('/athletes')}
                  className="mt-3 text-blue-600 text-sm font-medium hover:underline"
                >
                  Añadir primero
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentAthletes.map((athlete) => {
                  const lvl = levelBadge(athlete.level);
                  const st = statusBadge(athlete.status);
                  return (
                    <div
                      key={athlete.id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/athletes/${athlete.id}`)}
                    >
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                        {athlete.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {athlete.name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{athlete.sport || athlete.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {athlete.level && <Badge variant={lvl.variant}>{lvl.label}</Badge>}
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent Plans */}
          <Card padding="none">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle>Planes Recientes</CardTitle>
                <button
                  onClick={() => navigate('/plans')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  Ver todos <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {recentPlans.length === 0 ? (
              <div className="p-12 text-center">
                <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No hay planes creados</p>
                <button
                  onClick={() => navigate('/plans/new')}
                  className="mt-3 text-blue-600 text-sm font-medium hover:underline"
                >
                  Crear primero
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentPlans.map((plan) => {
                  const lvl = levelBadge(plan.level);
                  return (
                    <div
                      key={plan.id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/plans/${plan.id}`)}
                    >
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{plan.name}</p>
                        <p className="text-xs text-slate-400">
                          {plan.weeks.length} {plan.weeks.length === 1 ? 'semana' : 'semanas'} •{' '}
                          {format(new Date(plan.updatedAt), "d MMM", { locale: es })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {plan.level && <Badge variant={lvl.variant}>{lvl.label}</Badge>}
                        {plan.isTemplate && <Badge variant="cyan">Plantilla</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Welcome card if no data */}
        {athletes.length === 0 && plans.length === 0 && (
          <Card className="border-2 border-dashed border-blue-200 bg-blue-50/50">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Award className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                ¡Bienvenido a APD SPORT!
              </h3>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">
                Comienza añadiendo tus deportistas y creando planes de entrenamiento personalizados.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button icon={<Users className="w-4 h-4" />} onClick={() => navigate('/athletes')}>
                  Añadir Deportista
                </Button>
                <Button
                  variant="secondary"
                  icon={<ClipboardList className="w-4 h-4" />}
                  onClick={() => navigate('/plans/new')}
                >
                  Crear Plan
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};
