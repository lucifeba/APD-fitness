import React from 'react';

interface Props {
  muscleGroup: string;
  exerciseName: string;
  gifUrl?: string;
  imageUrl?: string;
  className?: string;
}

// Simple SVG muscle diagram body silhouette with highlighted region
const MUSCLE_HIGHLIGHTS: Record<string, { front: string; back: string; label: string; color: string }> = {
  'Pecho': {
    front: 'M 68,52 C 58,52 45,58 40,70 L 40,90 L 96,90 L 96,70 C 91,58 78,52 68,52 Z',
    back: '',
    label: 'Pectorales',
    color: '#ef4444',
  },
  'Espalda': {
    front: '',
    back: 'M 68,52 C 55,52 42,58 38,70 L 38,100 L 98,100 L 98,70 C 94,58 81,52 68,52 Z',
    label: 'Espalda',
    color: '#3b82f6',
  },
  'Hombros': {
    front: 'M 40,60 C 32,60 28,68 30,78 L 36,90 L 44,82 L 44,68 Z M 96,60 C 104,60 108,68 106,78 L 100,90 L 92,82 L 92,68 Z',
    back: '',
    label: 'Deltoides',
    color: '#8b5cf6',
  },
  'Bíceps': {
    front: 'M 34,88 C 28,88 24,96 26,110 L 32,124 L 40,116 L 38,100 Z M 102,88 C 108,88 112,96 110,110 L 104,124 L 96,116 L 98,100 Z',
    back: '',
    label: 'Bíceps',
    color: '#f97316',
  },
  'Tríceps': {
    front: '',
    back: 'M 34,88 C 28,88 24,96 26,110 L 32,124 L 40,116 L 38,100 Z M 102,88 C 108,88 112,96 110,110 L 104,124 L 96,116 L 98,100 Z',
    label: 'Tríceps',
    color: '#f59e0b',
  },
  'Antebrazos': {
    front: 'M 28,118 C 24,120 22,130 24,140 L 28,152 L 36,144 L 34,128 Z M 108,118 C 112,120 114,130 112,140 L 108,152 L 100,144 L 102,128 Z',
    back: '',
    label: 'Antebrazos',
    color: '#78716c',
  },
  'Core / Abdomen': {
    front: 'M 52,90 L 84,90 L 86,130 L 50,130 Z',
    back: '',
    label: 'Abdomen',
    color: '#10b981',
  },
  'Cuádriceps': {
    front: 'M 50,132 C 46,132 42,140 42,158 L 44,180 L 58,178 L 60,156 Z M 86,132 C 90,132 94,140 94,158 L 92,180 L 78,178 L 76,156 Z',
    back: '',
    label: 'Cuádriceps',
    color: '#06b6d4',
  },
  'Isquiotibiales': {
    front: '',
    back: 'M 50,132 C 46,132 42,140 42,158 L 44,180 L 58,178 L 60,156 Z M 86,132 C 90,132 94,140 94,158 L 92,180 L 78,178 L 76,156 Z',
    label: 'Isquiotibiales',
    color: '#14b8a6',
  },
  'Glúteos': {
    front: '',
    back: 'M 46,128 C 42,132 40,142 44,150 L 92,150 C 96,142 94,132 90,128 Z',
    label: 'Glúteos',
    color: '#ec4899',
  },
  'Pantorrillas': {
    front: 'M 46,182 C 42,184 40,192 42,206 L 46,218 L 58,214 L 58,196 Z M 90,182 C 94,184 96,192 94,206 L 90,218 L 78,214 L 78,196 Z',
    back: '',
    label: 'Gemelos',
    color: '#84cc16',
  },
  'Cuerpo Completo': {
    front: 'M 40,52 L 96,52 L 100,220 L 36,220 Z',
    back: '',
    label: 'Full Body',
    color: '#7c3aed',
  },
  'Cardio': {
    front: 'M 68,56 C 58,52 44,58 40,72 L 40,80 C 50,92 68,100 68,100 C 68,100 86,92 96,80 L 96,72 C 92,58 78,52 68,56 Z',
    back: '',
    label: 'Cardio',
    color: '#f43f5e',
  },
  'Movilidad / Flexibilidad': {
    front: 'M 68,34 C 60,34 54,40 54,48 C 54,56 60,62 68,62 C 76,62 82,56 82,48 C 82,40 76,34 68,34 Z',
    back: '',
    label: 'Movilidad',
    color: '#0ea5e9',
  },
};

// Body silhouette paths
const BODY_FRONT = `
  M 68,10 C 60,10 54,16 54,24 C 54,32 60,38 68,38 C 76,38 82,32 82,24 C 82,16 76,10 68,10 Z
  M 68,40 C 52,40 38,52 36,68 L 36,96 C 36,96 30,100 28,112 L 24,136 L 32,138 L 34,122 C 36,130 36,148 36,156 L 36,186 L 44,186 L 46,218 L 54,218 L 56,188 L 80,188 L 82,218 L 90,218 L 92,186 L 100,186 L 100,156 C 100,148 100,130 102,122 L 104,138 L 112,136 L 108,112 C 106,100 100,96 100,96 L 100,68 C 98,52 84,40 68,40 Z
`;

const BODY_BACK = `
  M 68,10 C 60,10 54,16 54,24 C 54,32 60,38 68,38 C 76,38 82,32 82,24 C 82,16 76,10 68,10 Z
  M 68,40 C 52,40 38,52 36,68 L 36,96 C 36,96 30,100 28,112 L 24,136 L 32,138 L 34,122 C 36,130 36,148 36,156 L 36,186 L 44,186 L 46,218 L 54,218 L 56,188 L 80,188 L 82,218 L 90,218 L 92,186 L 100,186 L 100,156 C 100,148 100,130 102,122 L 104,138 L 112,136 L 108,112 C 106,100 100,96 100,96 L 100,68 C 98,52 84,40 68,40 Z
`;

export const ExerciseSchematic: React.FC<Props> = ({ muscleGroup, exerciseName, gifUrl, imageUrl, className = '' }) => {
  // If actual GIF or image is available, show it
  if (gifUrl) {
    return (
      <div className={`rounded-xl overflow-hidden bg-slate-900 ${className}`}>
        <img src={gifUrl} alt={exerciseName} className="w-full object-contain max-h-48" />
      </div>
    );
  }
  if (imageUrl) {
    return (
      <div className={`rounded-xl overflow-hidden ${className}`}>
        <img src={imageUrl} alt={exerciseName} className="w-full object-contain max-h-48" />
      </div>
    );
  }

  const highlight = MUSCLE_HIGHLIGHTS[muscleGroup];
  const showBack = highlight?.back && !highlight?.front;
  const mainColor = highlight?.color || '#94a3b8';

  return (
    <div className={`flex gap-4 items-center justify-center py-3 ${className}`}>
      {/* Front view */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-slate-400 mb-1">Frontal</span>
        <svg viewBox="0 0 136 230" width="80" height="130" className="overflow-visible">
          {/* Body silhouette */}
          <path d={BODY_FRONT} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
          {/* Highlight */}
          {highlight?.front && (
            <path
              d={highlight.front}
              fill={mainColor}
              opacity="0.75"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>

      {/* Back view */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-slate-400 mb-1">Posterior</span>
        <svg viewBox="0 0 136 230" width="80" height="130" className="overflow-visible">
          <path d={BODY_BACK} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
          {highlight?.back && (
            <path
              d={highlight.back}
              fill={mainColor}
              opacity="0.75"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>

      {/* Label */}
      <div className="flex flex-col items-start gap-1.5">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-xs font-semibold"
          style={{ backgroundColor: mainColor }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white/50 inline-block animate-pulse" />
          {highlight?.label || muscleGroup}
        </div>
        <p className="text-xs text-slate-400 max-w-[90px] leading-snug">{exerciseName}</p>
      </div>
    </div>
  );
};
