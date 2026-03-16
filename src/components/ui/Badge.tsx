import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | 'blue'
    | 'green'
    | 'yellow'
    | 'red'
    | 'purple'
    | 'slate'
    | 'orange'
    | 'cyan';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'blue',
  size = 'md',
  className = '',
}) => {
  const variants = {
    blue: 'bg-blue-100 text-blue-700 border border-blue-200',
    green: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    yellow: 'bg-amber-100 text-amber-700 border border-amber-200',
    red: 'bg-red-100 text-red-700 border border-red-200',
    purple: 'bg-purple-100 text-purple-700 border border-purple-200',
    slate: 'bg-slate-100 text-slate-600 border border-slate-200',
    orange: 'bg-orange-100 text-orange-700 border border-orange-200',
    cyan: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
};

export const levelBadge = (
  level?: string
): { label: string; variant: BadgeProps['variant'] } => {
  switch (level) {
    case 'beginner':
      return { label: 'Principiante', variant: 'green' };
    case 'intermediate':
      return { label: 'Intermedio', variant: 'blue' };
    case 'advanced':
      return { label: 'Avanzado', variant: 'orange' };
    case 'elite':
      return { label: 'Élite', variant: 'purple' };
    default:
      return { label: level || 'Sin nivel', variant: 'slate' };
  }
};

export const statusBadge = (
  status?: string
): { label: string; variant: BadgeProps['variant'] } => {
  switch (status) {
    case 'active':
      return { label: 'Activo', variant: 'green' };
    case 'inactive':
      return { label: 'Inactivo', variant: 'slate' };
    case 'pending':
      return { label: 'Pendiente', variant: 'yellow' };
    case 'completed':
      return { label: 'Completado', variant: 'blue' };
    case 'paused':
      return { label: 'Pausado', variant: 'orange' };
    default:
      return { label: status || '', variant: 'slate' };
  }
};
