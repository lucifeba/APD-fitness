import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-5 h-5 text-emerald-600" />,
  error: <XCircle className="w-5 h-5 text-red-600" />,
  warning: <AlertCircle className="w-5 h-5 text-amber-600" />,
  info: <Info className="w-5 h-5 text-blue-600" />,
};

const colors = {
  success: 'bg-white border-l-4 border-l-emerald-500',
  error: 'bg-white border-l-4 border-l-red-500',
  warning: 'bg-white border-l-4 border-l-amber-500',
  info: 'bg-white border-l-4 border-l-blue-500',
};

const ToastComponent: React.FC<{
  toast: ToastItem;
  onRemove: () => void;
}> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(onRemove, 4000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border border-slate-100 min-w-72 max-w-sm ${colors[toast.type]} animate-slide-in`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-slate-700 font-medium">{toast.message}</p>
      <button
        onClick={onRemove}
        className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};
