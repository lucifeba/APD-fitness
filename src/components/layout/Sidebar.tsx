import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  ClipboardList,
  BookOpen,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Award,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '../../store/useStore';

const trainerNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/athletes', icon: Users, label: 'Deportistas' },
  { to: '/plans', icon: ClipboardList, label: 'Planes de Entrenamiento' },
  { to: '/exercises', icon: Dumbbell, label: 'Biblioteca de Ejercicios' },
  { to: '/assignments', icon: BookOpen, label: 'Asignaciones' },
  { to: '/settings', icon: Settings, label: 'Configuración' },
];

const adminNavItems = [
  { to: '/admin', icon: ShieldCheck, label: 'Panel Admin' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/athletes', icon: Users, label: 'Deportistas' },
  { to: '/plans', icon: ClipboardList, label: 'Planes' },
  { to: '/exercises', icon: Dumbbell, label: 'Ejercicios' },
  { to: '/settings', icon: Settings, label: 'Configuración' },
];

export const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({
  collapsed,
  onToggle,
}) => {
  const { currentUser, logout } = useStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = currentUser?.role === 'admin' ? adminNavItems : trainerNavItems;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={`flex items-center gap-3 p-4 border-b border-blue-700/50 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <div className="flex-shrink-0 w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md">
          <Award className="w-6 h-6 text-blue-600" />
        </div>
        {!collapsed && (
          <div>
            <span className="text-white font-bold text-lg leading-tight block">APD SPORT</span>
            <span className="text-blue-200 text-xs">Pro Trainer</span>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
              ${
                isActive
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }
              ${collapsed ? 'justify-center' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
                )}
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{label}</span>}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile */}
      <div className={`p-3 border-t border-blue-700/50`}>
        <div
          className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <div className="flex-shrink-0 w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{currentUser?.name}</p>
              <p className="text-blue-200 text-xs truncate">
                {currentUser?.role === 'admin' ? '⚡ Administrador' : currentUser?.email}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`mt-2 flex items-center gap-3 w-full px-3 py-2 rounded-xl text-blue-100 hover:bg-white/10 hover:text-white transition-all duration-200
            ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-blue-600 text-white rounded-xl shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-blue-800 to-blue-900 z-50 transform transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-full bg-gradient-to-b from-blue-800 to-blue-900 transition-all duration-300 relative flex-shrink-0 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent />

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors z-10"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </aside>
    </>
  );
};
