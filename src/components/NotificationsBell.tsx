import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, X, MessageSquare, ClipboardCheck, Apple, Dumbbell, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { AppNotification } from '../types';
import { useNavigate } from 'react-router-dom';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function notifIcon(type: AppNotification['type']) {
  switch (type) {
    case 'message': return <MessageSquare className="w-4 h-4 text-blue-500" />;
    case 'feedback_submitted': return <ClipboardCheck className="w-4 h-4 text-green-500" />;
    case 'feedback_request': return <ClipboardCheck className="w-4 h-4 text-amber-500" />;
    case 'nutrition_sent': return <Apple className="w-4 h-4 text-emerald-500" />;
    case 'plan_assigned': return <Dumbbell className="w-4 h-4 text-purple-500" />;
    case 'plan_updated': return <Dumbbell className="w-4 h-4 text-indigo-500" />;
    default: return <Info className="w-4 h-4 text-slate-400" />;
  }
}

export const NotificationsBell: React.FC = () => {
  const { currentUser, notifications, markNotificationRead, markAllNotificationsRead, deleteNotification } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const myNotifications = notifications
    .filter((n) => n.recipientId === currentUser?.id)
    .slice(0, 30)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unread = myNotifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = (n: AppNotification) => {
    markNotificationRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-slate-800 text-sm">Notificaciones {unread > 0 && <span className="text-blue-600">({unread})</span>}</span>
            {unread > 0 && currentUser && (
              <button
                onClick={() => markAllNotificationsRead(currentUser.id)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Leer todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {myNotifications.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Sin notificaciones
              </div>
            )}
            {myNotifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${
                  !n.read ? 'bg-blue-50/40' : ''
                }`}
                onClick={() => handleClick(n)}
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {notifIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                    className="text-slate-300 hover:text-red-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
