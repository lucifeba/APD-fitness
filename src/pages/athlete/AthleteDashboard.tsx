import React from 'react';
import { AthleteLayout } from './AthleteLayout';
import { useStore } from '../../store/useStore';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Apple, MessageSquare, ClipboardCheck,
  ChevronRight, Bell, Calendar, TrendingUp, Target,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const AthleteDashboard: React.FC = () => {
  const { currentUser, athletes, plans, assignments, nutritionPlans, feedbacks, notifications, chatMessages } = useStore();
  const navigate = useNavigate();

  // Find the athlete record linked to this user
  const athleteRecord = athletes.find((a) => a.email === currentUser?.email);

  // Their assignments/plans
  const myAssignments = assignments.filter((a) => a.athleteId === athleteRecord?.id);
  const activeAssignment = myAssignments.find((a) => a.status === 'active');
  const activePlan = activeAssignment ? plans.find((p) => p.id === activeAssignment.planId) : null;

  // Their nutrition plans
  const myNutritionPlans = nutritionPlans.filter((np) => np.athleteId === athleteRecord?.id);
  const latestNutritionPlan = myNutritionPlans[myNutritionPlans.length - 1];

  // Unread notifications
  const myNotifications = notifications.filter((n) => n.recipientId === currentUser?.id && !n.read);

  // Unread messages
  const unreadMessages = chatMessages.filter((m) => m.recipientId === currentUser?.id && !m.read).length;

  // Pending feedbacks this week
  const thisWeek = new Date();
  const weekNum = Math.ceil(thisWeek.getDate() / 7);
  const submittedThisWeek = feedbacks.some(
    (f) => f.athleteId === (athleteRecord?.id || '') && f.weekNumber === weekNum
  );

  const quickActions = [
    {
      icon: ClipboardList,
      label: 'Mi Plan de Entrenamiento',
      desc: activePlan ? activePlan.name : 'Sin plan activo',
      color: 'bg-blue-500',
      to: '/athlete/plans',
    },
    {
      icon: Apple,
      label: 'Mi Plan Nutricional',
      desc: latestNutritionPlan ? latestNutritionPlan.name : 'Sin plan nutricional',
      color: 'bg-emerald-500',
      to: '/athlete/nutrition',
    },
    {
      icon: MessageSquare,
      label: 'Chat con Entrenador',
      desc: unreadMessages > 0 ? `${unreadMessages} mensajes sin leer` : 'Sin mensajes nuevos',
      color: 'bg-purple-500',
      badge: unreadMessages,
      to: '/athlete/chat',
    },
    {
      icon: ClipboardCheck,
      label: 'Feedback Semanal',
      desc: submittedThisWeek ? 'Enviado esta semana ✓' : 'Pendiente de enviar',
      color: submittedThisWeek ? 'bg-green-500' : 'bg-amber-500',
      to: '/athlete/feedback',
    },
  ];

  return (
    <AthleteLayout title="Mi Dashboard" subtitle={`Bienvenido, ${currentUser?.name}`}>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">

        {/* Welcome card */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">¡Hola, {currentUser?.name?.split(' ')[0]}! 👋</h2>
              <p className="text-green-100 text-sm">{format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}</p>
              {athleteRecord && (
                <p className="text-green-100 text-xs mt-1">
                  {athleteRecord.sport && `🏅 ${athleteRecord.sport}`}
                  {athleteRecord.level && ` · Nivel: ${athleteRecord.level}`}
                </p>
              )}
            </div>
            <div className="text-right">
              {myNotifications.length > 0 && (
                <div className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5 text-xs font-medium">
                  <Bell className="w-3.5 h-3.5" />
                  {myNotifications.length} notif.
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: 'Planes asignados', value: myAssignments.length, icon: '🏋️' },
              { label: 'Feedbacks enviados', value: feedbacks.filter((f) => f.athleteId === (athleteRecord?.id || '')).length, icon: '📊' },
              { label: 'Planes nutricionales', value: myNutritionPlans.length, icon: '🥗' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/15 rounded-xl p-3 text-center">
                <p className="text-lg">{stat.icon}</p>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-green-200 text-xs">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        {myNotifications.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4" /> {myNotifications.length} notificaciones nuevas
            </h3>
            <div className="space-y-2">
              {myNotifications.slice(0, 3).map((n) => (
                <div key={n.id} className="bg-white rounded-xl px-3 py-2.5 border border-blue-100">
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">Accesos Rápidos</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="flex items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-green-300 hover:shadow-md transition-all text-left group"
              >
                <div className={`w-11 h-11 ${action.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <action.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{action.label}</p>
                  <p className="text-xs text-slate-400 truncate">{action.desc}</p>
                </div>
                {(action as any).badge > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {(action as any).badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-green-500" />
              </button>
            ))}
          </div>
        </div>

        {/* Active plan summary */}
        {activePlan && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Plan Activo</h3>
              <button
                onClick={() => navigate('/athlete/plans')}
                className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
              >
                Ver completo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{activePlan.name}</p>
                <p className="text-sm text-slate-400 mt-1">
                  {activePlan.duration} semanas · {activePlan.daysPerWeek} días/semana
                  {activePlan.level && ` · ${activePlan.level}`}
                </p>
                {activePlan.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{activePlan.description}</p>
                )}
              </div>
            </div>
            {activeAssignment?.startDate && (
              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center gap-2 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                Inicio: {format(new Date(activeAssignment.startDate), "d MMM yyyy", { locale: es })}
              </div>
            )}
          </div>
        )}

        {/* Feedback reminder */}
        {!submittedThisWeek && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="w-8 h-8 text-amber-500" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Feedback semanal pendiente</p>
                  <p className="text-xs text-amber-600">Comparte cómo ha ido tu semana con tu entrenador</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/athlete/feedback')}
                className="px-3 py-2 bg-amber-500 text-white text-xs font-medium rounded-xl hover:bg-amber-600 transition"
              >
                Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </AthleteLayout>
  );
};
