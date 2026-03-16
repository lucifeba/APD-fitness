import React from 'react';
import { Bell } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { currentUser } = useStore();

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors relative">
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-slate-700">{currentUser?.name}</p>
            <p className="text-xs text-slate-500">Entrenador Personal</p>
          </div>
        </div>
      </div>
    </header>
  );
};
