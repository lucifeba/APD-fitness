import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Apple, MessageSquare,
  ClipboardCheck, Settings, LogOut, Award, Menu, X,
  User, Bell,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { NotificationsBell } from '../../components/NotificationsBell';

const navItems = [
  { to: '/athlete/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { to: '/athlete/plans', icon: ClipboardList, label: 'Mi Plan de Entrenamiento' },
  { to: '/athlete/nutrition', icon: Apple, label: 'Mi Plan Nutricional' },
  { to: '/athlete/chat', icon: MessageSquare, label: 'Chat con Entrenador' },
  { to: '/athlete/feedback', icon: ClipboardCheck, label: 'Feedback Semanal' },
  { to: '/athlete/profile', icon: User, label: 'Mi Perfil' },
];

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const AthleteLayout: React.FC<Props> = ({ children, title, subtitle }) => {
  const { currentUser, logout } = useStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-green-700/50">
        <div className="flex-shrink-0 w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md">
          <Award className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <span className="text-white font-bold text-lg leading-tight block">APD SPORT</span>
          <span className="text-green-200 text-xs">Mi Portal Deportivo</span>
        </div>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-b border-green-700/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{currentUser?.name}</p>
            <p className="text-green-200 text-xs">Deportista</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
              ${isActive ? 'bg-white/20 text-white shadow-sm' : 'text-green-100 hover:bg-white/10 hover:text-white'}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />}
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-green-700/50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-green-100 hover:bg-white/10 hover:text-white transition-all duration-200"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-green-600 text-white rounded-xl shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={`lg:hidden fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-green-700 to-green-900 z-50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col h-full bg-gradient-to-b from-green-700 to-green-900 w-64 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 pl-16 lg:pl-6 pr-4 sm:pr-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {title && <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{title}</h1>}
            {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationsBell />
            <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-200">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="hidden lg:block">
                <p className="text-sm font-medium text-slate-700">{currentUser?.name}</p>
                <p className="text-xs text-slate-500">Deportista</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
