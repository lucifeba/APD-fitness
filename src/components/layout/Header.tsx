import React from 'react';
import { useStore } from '../../store/useStore';
import { NotificationsBell } from '../NotificationsBell';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { currentUser } = useStore();

  return (
    <header className="bg-white border-b border-slate-200 pl-16 lg:pl-6 pr-4 sm:pr-6 py-3 sm:py-4 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {actions}
        <NotificationsBell />
        <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-200">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-slate-700 whitespace-nowrap">{currentUser?.name}</p>
            <p className="text-xs text-slate-500">{currentUser?.role === 'admin' ? 'Administrador' : 'Entrenador'}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
