import React, { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { useStore } from '../store/useStore';
import { FEEDBACK_QUESTIONS } from '../types';
import type { WeeklyFeedback } from '../types';
import {
  ClipboardCheck, ChevronDown, ChevronUp, CheckCircle,
  Star, AlertCircle, User, Calendar, Eye, BarChart2,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { es } from 'date-fns/locale';

function getWeekLabel(iso: string) {
  const d = new Date(iso);
  return `Semana ${getWeek(d, { locale: es })} — ${format(d, "d MMM", { locale: es })}`;
}

// ─── ATHLETE VIEW: submit feedback form ───────────────────────────────────────
const AthleteView: React.FC = () => {
  const { currentUser, athletes, submitFeedback, feedbacks, sendChatMessage, addNotification } = useStore();
  const [answers, setAnswers] = useState<Record<string, string | number | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Find the athlete record linked to current user (by email)
  const athleteRecord = athletes.find((a) => a.email === currentUser?.email);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekNumber = getWeek(now, { locale: es });

  const alreadySubmitted = feedbacks.some(
    (f) => f.athleteId === (athleteRecord?.id || currentUser?.id) &&
    f.weekNumber === weekNumber &&
    new Date(f.weekStartDate).getFullYear() === now.getFullYear()
  );

  const myFeedbacks = feedbacks
    .filter((f) => f.athleteId === (athleteRecord?.id || currentUser?.id))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const handleAnswer = (qId: string, value: string | number | string[]) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = () => {
    const trainerId = athleteRecord?.trainerId || 'admin-001';
    const athleteId = athleteRecord?.id || currentUser?.id || '';
    const athleteName = currentUser?.name || '';

    const fb = submitFeedback({
      athleteId,
      athleteName,
      trainerId,
      weekNumber,
      weekStartDate: weekStart.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      answers,
    });

    // Auto message in chat
    const convId = [athleteId, trainerId].sort().join('_');
    sendChatMessage({
      conversationId: convId,
      senderId: athleteId,
      senderName: athleteName,
      senderRole: 'trainer',
      recipientId: trainerId,
      recipientName: 'Entrenador',
      text: `📋 Feedback semanal enviado — ${getWeekLabel(weekStart.toISOString())}`,
      isSystemMessage: true,
    });

    // Notify trainer
    addNotification({
      recipientId: trainerId,
      senderId: athleteId,
      senderName: athleteName,
      type: 'feedback_submitted',
      title: 'Nuevo Feedback Semanal',
      body: `${athleteName} ha enviado su feedback de la ${getWeekLabel(weekStart.toISOString())}`,
      link: '/feedback',
    });

    setSubmitted(true);
  };

  if (submitted || alreadySubmitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-green-800 mb-2">¡Feedback enviado!</h2>
          <p className="text-green-600 text-sm">Tu entrenador ha sido notificado. Gracias por tu seguimiento semanal.</p>
        </div>

        {myFeedbacks.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base font-bold text-slate-700 mb-4">Historial de feedbacks</h3>
            <div className="space-y-3">
              {myFeedbacks.map((fb) => (
                <FeedbackCard key={fb.id} fb={fb} showAnswers={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Feedback Semanal</p>
            <p className="text-xs text-slate-400">
              {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-2">Responde las siguientes preguntas sobre tu semana para que tu entrenador pueda hacer un seguimiento adecuado.</p>
      </div>

      <div className="space-y-4">
        {FEEDBACK_QUESTIONS.map((q) => (
          <div key={q.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-700 mb-3">{q.label}</p>

            {q.type === 'scale' && (
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>{q.min}</span>
                  <span>{answers[q.id] !== undefined ? <strong className="text-blue-600">{answers[q.id]}</strong> : '—'}</span>
                  <span>{q.max}</span>
                </div>
                <input
                  type="range"
                  min={q.min}
                  max={q.max}
                  value={answers[q.id] !== undefined ? Number(answers[q.id]) : Math.round(((q.min || 0) + (q.max || 10)) / 2)}
                  onChange={(e) => handleAnswer(q.id, Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-300 mt-1">
                  {Array.from({ length: (q.max || 10) - (q.min || 1) + 1 }, (_, i) => (q.min || 1) + i).map((v) => (
                    <span key={v}>{v}</span>
                  ))}
                </div>
              </div>
            )}

            {q.type === 'text' && (
              <textarea
                rows={2}
                value={(answers[q.id] as string) || ''}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
                placeholder="Escribe aquí..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            )}

            {q.type === 'yesno' && (
              <div className="flex gap-3">
                {['Sí', 'No'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleAnswer(q.id, opt)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${
                      answers[q.id] === opt
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'multiselect' && q.options && (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = ((answers[q.id] as string[]) || []).includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const current = (answers[q.id] as string[]) || [];
                        handleAnswer(q.id, selected ? current.filter((o) => o !== opt) : [...current, opt]);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        className="mt-6 w-full py-3 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 transition flex items-center justify-center gap-2"
      >
        <ClipboardCheck className="w-5 h-5" />
        Enviar Feedback Semanal
      </button>
    </div>
  );
};

// ─── TRAINER VIEW: list feedbacks ─────────────────────────────────────────────
const TrainerView: React.FC = () => {
  const { currentUser, feedbacks, markFeedbackRead, athletes } = useStore();
  const [selected, setSelected] = useState<WeeklyFeedback | null>(null);
  const [filterAthlete, setFilterAthlete] = useState('');

  const myAthletes = athletes.filter((a) => a.trainerId === currentUser?.id);
  const myFeedbacks = feedbacks
    .filter((f) => f.trainerId === currentUser?.id && (!filterAthlete || f.athleteId === filterAthlete))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const unread = feedbacks.filter((f) => f.trainerId === currentUser?.id && !f.readByTrainer).length;

  const handleOpen = (fb: WeeklyFeedback) => {
    setSelected(fb);
    if (!fb.readByTrainer) markFeedbackRead(fb.id);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Feedbacks Semanales</h2>
          <p className="text-sm text-slate-400">{myFeedbacks.length} enviados · {unread} sin leer</p>
        </div>
        <select
          value={filterAthlete}
          onChange={(e) => setFilterAthlete(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los deportistas</option>
          {myAthletes.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {myFeedbacks.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aún no hay feedbacks recibidos</p>
        </div>
      )}

      <div className="grid gap-3">
        {myFeedbacks.map((fb) => (
          <button
            key={fb.id}
            onClick={() => handleOpen(fb)}
            className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-blue-300 transition ${
              !fb.readByTrainer ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                  {fb.athleteName.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{fb.athleteName}</p>
                  <p className="text-xs text-slate-400">{getWeekLabel(fb.weekStartDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!fb.readByTrainer && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                <span className="text-xs text-slate-400">{format(new Date(fb.submittedAt), "d MMM HH:mm", { locale: es })}</span>
                <Eye className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            {/* Quick metrics */}
            <div className="flex flex-wrap gap-3 mt-3">
              {[
                { id: 'energy_level', label: 'Energía', icon: '⚡' },
                { id: 'adherence_training', label: 'Entreno', icon: '🏋️' },
                { id: 'adherence_nutrition', label: 'Dieta', icon: '🥗' },
                { id: 'sleep_quality', label: 'Sueño', icon: '😴' },
              ].map(({ id, label, icon }) => {
                const val = fb.answers[id];
                if (!val) return null;
                const num = Number(val);
                const color = num >= 7 ? 'text-green-600 bg-green-50' : num >= 5 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
                return (
                  <span key={id} className={`text-xs px-2 py-1 rounded-lg font-medium ${color}`}>
                    {icon} {label}: {val}/10
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">{selected.athleteName}</h3>
                <p className="text-xs text-slate-400">{getWeekLabel(selected.weekStartDate)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {FEEDBACK_QUESTIONS.map((q) => {
                const answer = selected.answers[q.id];
                if (!answer && answer !== 0) return null;
                return (
                  <div key={q.id} className="border-b border-slate-50 pb-4 last:border-0">
                    <p className="text-xs font-semibold text-slate-500 mb-1">{q.label}</p>
                    {q.type === 'scale' ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${Number(answer) >= 7 ? 'bg-green-400' : Number(answer) >= 5 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${(Number(answer) / (q.max || 10)) * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-700 w-10 text-right">{answer}/{q.max}</span>
                      </div>
                    ) : Array.isArray(answer) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(answer as string[]).map((v) => (
                          <span key={v} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{v}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700">{String(answer)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── FEEDBACK CARD (shared) ────────────────────────────────────────────────────
const FeedbackCard: React.FC<{ fb: WeeklyFeedback; showAnswers: boolean }> = ({ fb, showAnswers }) => (
  <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-700">{getWeekLabel(fb.weekStartDate)}</span>
      <span className="text-xs text-slate-400">{format(new Date(fb.submittedAt), "d MMM yyyy", { locale: es })}</span>
    </div>
  </div>
);

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export const Feedback: React.FC = () => {
  const { currentUser } = useStore();
  const isTrainer = currentUser?.role === 'trainer' || currentUser?.role === 'admin';

  // Determine if this user is a "patient/athlete" by checking if they were registered via anamnesis
  // In this app, athletes have a trainer. Trainers/admins see the trainer view.
  return (
    <Layout>
      <Header
        title="Feedback Semanal"
        subtitle={isTrainer ? 'Seguimiento de tus deportistas' : 'Comparte tu progreso semanal'}
      />
      {isTrainer ? <TrainerView /> : <AthleteView />}
    </Layout>
  );
};
