import React from 'react';

interface Props {
  muscleGroup: string;
  exerciseName: string;
  gifUrl?: string;
  imageUrl?: string;
  className?: string;
}

// Muscle highlight definitions mapped to SVG paths on the realistic body diagram
// ViewBox: 0 0 160 290 for each view (front/back)
const MUSCLE_HIGHLIGHTS: Record<string, { front: string; back: string; label: string; color: string }> = {
  'Pecho': {
    front: `M 52,66 C 46,66 40,72 40,82 L 40,102 C 48,108 60,110 70,108 L 74,104 L 74,68 C 66,64 58,64 52,66 Z
            M 108,66 C 114,66 120,72 120,82 L 120,102 C 112,108 100,110 90,108 L 86,104 L 86,68 C 94,64 102,64 108,66 Z`,
    back: '',
    label: 'Pectorales',
    color: '#ef4444',
  },
  'Espalda': {
    front: '',
    back: `M 44,66 C 38,68 34,74 34,84 L 34,120 C 44,130 60,136 80,136 C 100,136 116,130 126,120 L 126,84 C 126,74 122,68 116,66 L 108,62 L 80,60 L 52,62 Z`,
    label: 'Dorsales / Espalda',
    color: '#3b82f6',
  },
  'Hombros': {
    front: `M 28,64 C 22,62 16,68 16,78 L 16,96 C 22,102 32,102 38,96 L 40,82 C 40,70 34,64 28,64 Z
            M 132,64 C 138,62 144,68 144,78 L 144,96 C 138,102 128,102 122,96 L 120,82 C 120,70 126,64 132,64 Z`,
    back: `M 28,64 C 22,62 16,68 16,78 L 16,96 C 22,102 32,102 38,96 L 40,82 C 40,70 34,64 28,64 Z
           M 132,64 C 138,62 144,68 144,78 L 144,96 C 138,102 128,102 122,96 L 120,82 C 120,70 126,64 132,64 Z`,
    label: 'Deltoides',
    color: '#8b5cf6',
  },
  'Bíceps': {
    front: `M 18,98 C 14,98 10,106 12,118 L 16,132 C 22,136 30,134 34,128 L 36,112 C 36,102 28,96 18,98 Z
            M 142,98 C 146,98 150,106 148,118 L 144,132 C 138,136 130,134 126,128 L 124,112 C 124,102 132,96 142,98 Z`,
    back: '',
    label: 'Bíceps',
    color: '#f97316',
  },
  'Tríceps': {
    front: '',
    back: `M 18,98 C 14,98 10,106 12,118 L 16,134 C 22,140 32,140 36,134 L 38,118 C 38,106 28,96 18,98 Z
           M 142,98 C 146,98 150,106 148,118 L 144,134 C 138,140 128,140 124,134 L 122,118 C 122,106 132,96 142,98 Z`,
    label: 'Tríceps',
    color: '#f59e0b',
  },
  'Antebrazos': {
    front: `M 12,136 C 8,138 6,148 8,160 L 12,172 C 18,176 26,174 30,168 L 32,154 C 32,144 22,134 12,136 Z
            M 148,136 C 152,138 154,148 152,160 L 148,172 C 142,176 134,174 130,168 L 128,154 C 128,144 138,134 148,136 Z`,
    back: '',
    label: 'Antebrazos',
    color: '#a78bfa',
  },
  'Core / Abdomen': {
    front: `M 62,108 L 98,108 L 98,116 L 62,116 Z
            M 60,118 L 100,118 L 100,126 L 60,126 Z
            M 60,128 L 100,128 L 100,136 L 60,136 Z
            M 62,138 L 98,138 L 98,146 L 62,146 Z
            M 52,106 C 48,112 46,120 48,130 L 52,142 L 60,140 L 60,108 Z
            M 108,106 C 112,112 114,120 112,130 L 108,142 L 100,140 L 100,108 Z`,
    back: '',
    label: 'Abdominales',
    color: '#10b981',
  },
  'Cuádriceps': {
    front: `M 50,160 C 44,160 40,168 40,180 L 40,210 C 42,222 50,230 60,230 L 72,228 C 78,220 80,208 78,196 L 76,174 C 72,162 62,158 50,160 Z
            M 110,160 C 116,160 120,168 120,180 L 120,210 C 118,222 110,230 100,230 L 88,228 C 82,220 80,208 82,196 L 84,174 C 88,162 98,158 110,160 Z`,
    back: '',
    label: 'Cuádriceps',
    color: '#06b6d4',
  },
  'Isquiotibiales': {
    front: '',
    back: `M 50,160 C 44,162 40,170 40,182 L 40,212 C 42,224 50,230 60,230 L 72,228 C 78,220 80,208 78,196 L 76,174 C 72,162 62,158 50,160 Z
           M 110,160 C 116,162 120,170 120,182 L 120,212 C 118,224 110,230 100,230 L 88,228 C 82,220 80,208 82,196 L 84,174 C 88,162 98,158 110,160 Z`,
    label: 'Isquiotibiales',
    color: '#14b8a6',
  },
  'Glúteos': {
    front: '',
    back: `M 44,148 C 40,156 38,168 42,178 L 52,186 L 78,188 L 80,166 L 80,150 Z
           M 116,148 C 120,156 122,168 118,178 L 108,186 L 82,188 L 80,166 L 80,150 Z`,
    label: 'Glúteos',
    color: '#ec4899',
  },
  'Pantorrillas': {
    front: `M 44,234 C 40,238 38,248 40,262 L 44,276 C 50,282 60,280 64,274 L 66,258 C 66,244 56,232 44,234 Z
            M 116,234 C 120,238 122,248 120,262 L 116,276 C 110,282 100,280 96,274 L 94,258 C 94,244 104,232 116,234 Z`,
    back: `M 44,234 C 40,238 38,248 40,262 L 44,276 C 50,282 60,282 64,276 L 68,260 C 68,246 58,232 44,234 Z
           M 116,234 C 120,238 122,248 120,262 L 116,276 C 110,282 100,282 96,276 L 92,260 C 92,246 102,232 116,234 Z`,
    label: 'Gemelos',
    color: '#84cc16',
  },
  'Trapecio': {
    front: `M 70,54 C 62,56 54,62 52,68 L 80,66 L 108,68 C 106,62 98,56 90,54 Z`,
    back: `M 52,62 C 46,66 42,74 42,82 L 80,78 L 118,82 C 118,74 114,66 108,62 L 90,58 Z`,
    label: 'Trapecio',
    color: '#6366f1',
  },
  'Cuerpo Completo': {
    front: `M 28,60 L 132,60 L 140,160 L 120,290 L 80,290 L 40,290 L 20,160 Z`,
    back: `M 28,60 L 132,60 L 140,160 L 120,290 L 80,290 L 40,290 L 20,160 Z`,
    label: 'Cuerpo Completo',
    color: '#7c3aed',
  },
  'Cardio': {
    front: `M 54,70 C 50,66 44,68 42,74 C 40,80 46,88 54,90 L 80,104 L 106,90 C 114,88 120,80 118,74 C 116,68 110,66 106,70 C 100,76 88,80 80,80 C 72,80 60,76 54,70 Z`,
    back: '',
    label: 'Cardio / Corazón',
    color: '#f43f5e',
  },
  'Movilidad / Flexibilidad': {
    front: `M 80,8 C 72,8 66,14 66,22 C 66,30 72,36 80,36 C 88,36 94,30 94,22 C 94,14 88,8 80,8 Z`,
    back: '',
    label: 'Movilidad',
    color: '#0ea5e9',
  },
};

// ── Realistic male body SVG - FRONT VIEW ─────────────────────────────────────
// ViewBox: 0 0 160 295, center x=80
const BodyFrontSVG: React.FC<{ highlight?: { path: string; color: string } }> = ({ highlight }) => (
  <svg viewBox="0 0 160 295" width="90" height="158" className="overflow-visible drop-shadow-sm">
    <defs>
      <radialGradient id="bodyGradF" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#d1d5db" />
        <stop offset="100%" stopColor="#9ca3af" />
      </radialGradient>
      <radialGradient id="skinGradF" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#e8d5c4" />
        <stop offset="100%" stopColor="#c9a98a" />
      </radialGradient>
    </defs>

    {/* HEAD */}
    <ellipse cx="80" cy="22" rx="19" ry="22" fill="url(#skinGradF)" stroke="#b8976a" strokeWidth="0.8" />
    {/* Ear left */}
    <ellipse cx="61" cy="23" rx="4" ry="5" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />
    {/* Ear right */}
    <ellipse cx="99" cy="23" rx="4" ry="5" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />
    {/* Hair */}
    <path d="M 62,10 C 64,4 72,2 80,2 C 88,2 96,4 98,10 C 94,6 86,6 80,6 C 74,6 66,6 62,10 Z" fill="#4b3621" />
    {/* Face details */}
    <ellipse cx="73" cy="20" rx="3" ry="2" fill="#4b3621" opacity="0.6" /> {/* left eye */}
    <ellipse cx="87" cy="20" rx="3" ry="2" fill="#4b3621" opacity="0.6" /> {/* right eye */}
    <path d="M 76,27 Q 80,30 84,27" fill="none" stroke="#c09070" strokeWidth="1" /> {/* mouth */}
    {/* Nose */}
    <path d="M 80,22 L 78,26 Q 80,27 82,26 Z" fill="#c09070" opacity="0.5" />

    {/* NECK */}
    <path d="M 72,43 L 70,56 L 90,56 L 88,43 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />
    {/* Neck muscles */}
    <path d="M 73,44 L 72,55 L 75,55 L 76,44 Z" fill="#c8a882" opacity="0.5" />
    <path d="M 87,44 L 84,55 L 85,55 L 88,44 Z" fill="#c8a882" opacity="0.5" />

    {/* TRAPEZIUS */}
    <path d="M 70,54 C 62,56 54,62 50,70 L 80,68 L 110,70 C 106,62 98,56 90,54 Z" fill="#b0bec5" stroke="#90a4ae" strokeWidth="0.7" />

    {/* LEFT ARM */}
    {/* Left Deltoid */}
    <path d="M 26,66 C 18,66 12,74 14,84 L 18,100 C 24,106 36,106 40,98 L 40,80 C 40,70 34,64 26,66 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.7" />
    {/* Left Upper arm (bicep side) */}
    <path d="M 16,100 C 12,104 10,116 14,128 L 18,140 C 24,146 36,144 38,136 L 38,116 C 38,106 28,98 16,100 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Left Forearm */}
    <path d="M 14,140 C 10,144 8,156 12,168 L 16,180 C 22,184 34,180 36,172 L 36,158 C 36,148 24,138 14,140 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Left Hand */}
    <ellipse cx="20" cy="188" rx="9" ry="12" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />

    {/* RIGHT ARM */}
    {/* Right Deltoid */}
    <path d="M 134,66 C 142,66 148,74 146,84 L 142,100 C 136,106 124,106 120,98 L 120,80 C 120,70 126,64 134,66 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.7" />
    {/* Right Upper arm */}
    <path d="M 144,100 C 148,104 150,116 146,128 L 142,140 C 136,146 124,144 122,136 L 122,116 C 122,106 132,98 144,100 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Right Forearm */}
    <path d="M 146,140 C 150,144 152,156 148,168 L 144,180 C 138,184 126,180 124,172 L 124,158 C 124,148 136,138 146,140 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Right Hand */}
    <ellipse cx="140" cy="188" rx="9" ry="12" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />

    {/* TORSO */}
    {/* Main chest/torso block */}
    <path d="M 42,66 L 118,66 L 122,100 L 120,140 L 116,158 L 100,162 L 80,164 L 60,162 L 44,158 L 38,140 L 38,100 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.7" />
    {/* Chest left pec */}
    <path d="M 44,70 C 40,74 40,86 44,96 C 50,104 66,108 74,104 L 78,98 L 78,72 C 68,66 52,66 44,70 Z" fill="#cfd8dc" stroke="#90a4ae" strokeWidth="0.5" />
    {/* Chest right pec */}
    <path d="M 116,70 C 120,74 120,86 116,96 C 110,104 94,108 86,104 L 82,98 L 82,72 C 92,66 108,66 116,70 Z" fill="#cfd8dc" stroke="#90a4ae" strokeWidth="0.5" />
    {/* Sternum line */}
    <line x1="80" y1="66" x2="80" y2="164" stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,3" opacity="0.4" />
    {/* Abs section 1 */}
    <rect x="64" y="108" width="13" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    <rect x="83" y="108" width="13" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Abs section 2 */}
    <rect x="63" y="120" width="14" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    <rect x="83" y="120" width="14" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Abs section 3 */}
    <rect x="63" y="132" width="14" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    <rect x="83" y="132" width="14" height="10" rx="3" fill="#bfc9d1" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Obliques */}
    <path d="M 44,108 C 42,116 42,128 46,140 L 56,148 L 62,148 L 58,132 L 52,112 Z" fill="#b0bec5" stroke="#90a4ae" strokeWidth="0.4" />
    <path d="M 116,108 C 118,116 118,128 114,140 L 104,148 L 98,148 L 102,132 L 108,112 Z" fill="#b0bec5" stroke="#90a4ae" strokeWidth="0.4" />

    {/* HIPS/PELVIS */}
    <path d="M 44,158 C 42,162 40,168 42,174 L 48,180 L 80,182 L 112,180 L 118,174 C 120,168 118,162 116,158 Z" fill="#c8d0d8" stroke="#94a3b8" strokeWidth="0.6" />

    {/* LEFT LEG */}
    {/* Left Quad */}
    <path d="M 44,178 C 38,180 34,190 36,204 L 40,222 C 44,232 54,236 62,232 L 70,226 C 74,216 74,202 70,190 L 64,180 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Left Knee */}
    <ellipse cx="52" cy="236" rx="14" ry="9" fill="#c5cdd5" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Left Calf (Tibia/Shin) */}
    <path d="M 40,244 C 36,248 36,260 40,272 L 46,282 C 52,286 62,282 64,274 L 66,260 C 66,248 56,242 40,244 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Left Foot */}
    <path d="M 36,280 C 32,282 30,288 34,292 L 52,294 L 60,290 L 60,282 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />

    {/* RIGHT LEG */}
    {/* Right Quad */}
    <path d="M 116,178 C 122,180 126,190 124,204 L 120,222 C 116,232 106,236 98,232 L 90,226 C 86,216 86,202 90,190 L 96,180 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Right Knee */}
    <ellipse cx="108" cy="236" rx="14" ry="9" fill="#c5cdd5" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Right Calf */}
    <path d="M 120,244 C 124,248 124,260 120,272 L 114,282 C 108,286 98,282 96,274 L 94,260 C 94,248 104,242 120,244 Z" fill="url(#bodyGradF)" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Right Foot */}
    <path d="M 124,280 C 128,282 130,288 126,292 L 108,294 L 100,290 L 100,282 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />

    {/* MUSCLE HIGHLIGHT */}
    {highlight && (
      <path
        d={highlight.path}
        fill={highlight.color}
        opacity="0.72"
        style={{ animation: 'pulse 1.5s ease-in-out infinite alternate' }}
      />
    )}

    <style>{`
      @keyframes pulse {
        from { opacity: 0.55; }
        to { opacity: 0.85; }
      }
    `}</style>
  </svg>
);

// ── Realistic male body SVG - BACK VIEW ──────────────────────────────────────
const BodyBackSVG: React.FC<{ highlight?: { path: string; color: string } }> = ({ highlight }) => (
  <svg viewBox="0 0 160 295" width="90" height="158" className="overflow-visible drop-shadow-sm">
    <defs>
      <radialGradient id="bodyGradB" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#d1d5db" />
        <stop offset="100%" stopColor="#9ca3af" />
      </radialGradient>
      <radialGradient id="skinGradB" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#e8d5c4" />
        <stop offset="100%" stopColor="#c9a98a" />
      </radialGradient>
    </defs>

    {/* HEAD (back) */}
    <ellipse cx="80" cy="22" rx="19" ry="22" fill="url(#skinGradB)" stroke="#b8976a" strokeWidth="0.8" />
    {/* Hair */}
    <path d="M 62,10 C 64,2 96,2 98,10 C 94,4 66,4 62,10 Z" fill="#4b3621" />
    <path d="M 62,10 C 62,14 62,18 62,22 C 62,28 68,38 80,40 C 92,38 98,28 98,22 L 98,10" fill="#4b3621" opacity="0.3" />
    {/* Ear left */}
    <ellipse cx="61" cy="23" rx="4" ry="5" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />
    {/* Ear right */}
    <ellipse cx="99" cy="23" rx="4" ry="5" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />

    {/* NECK (back) */}
    <path d="M 72,43 L 70,56 L 90,56 L 88,43 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />

    {/* TRAPEZIUS (very visible from back) */}
    <path d="M 50,58 C 42,64 36,72 36,82 L 80,78 L 124,82 C 124,72 118,64 110,58 L 90,54 L 80,52 L 70,54 Z" fill="#b0bec5" stroke="#94a3b8" strokeWidth="0.7" />

    {/* LEFT ARM (back) */}
    <path d="M 26,66 C 18,66 12,74 14,84 L 18,100 C 24,106 36,106 40,98 L 40,80 C 40,70 34,64 26,66 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.7" />
    <path d="M 16,100 C 12,104 10,116 14,128 L 18,140 C 24,146 36,144 38,136 L 38,116 C 38,106 28,98 16,100 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Tricep visible from back */}
    <path d="M 14,100 C 10,108 10,120 14,132 L 18,140 L 22,136 L 20,120 L 18,106 Z" fill="#bfc9d1" opacity="0.7" stroke="#90a4ae" strokeWidth="0.4" />
    <path d="M 14,140 C 10,144 8,156 12,168 L 16,180 C 22,184 34,180 36,172 L 36,158 C 36,148 24,138 14,140 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    <ellipse cx="20" cy="188" rx="9" ry="12" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />

    {/* RIGHT ARM (back) */}
    <path d="M 134,66 C 142,66 148,74 146,84 L 142,100 C 136,106 124,106 120,98 L 120,80 C 120,70 126,64 134,66 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.7" />
    <path d="M 144,100 C 148,104 150,116 146,128 L 142,140 C 136,146 124,144 122,136 L 122,116 C 122,106 132,98 144,100 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Tricep right */}
    <path d="M 146,100 C 150,108 150,120 146,132 L 142,140 L 138,136 L 140,120 L 142,106 Z" fill="#bfc9d1" opacity="0.7" stroke="#90a4ae" strokeWidth="0.4" />
    <path d="M 146,140 C 150,144 152,156 148,168 L 144,180 C 138,184 126,180 124,172 L 124,158 C 124,148 136,138 146,140 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    <ellipse cx="140" cy="188" rx="9" ry="12" fill="#d4b896" stroke="#b8976a" strokeWidth="0.6" />

    {/* TORSO (BACK) */}
    <path d="M 42,66 L 118,66 L 122,100 L 120,140 L 116,158 L 100,162 L 80,164 L 60,162 L 44,158 L 38,140 L 38,100 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.7" />

    {/* Upper back muscles: Rhomboids / Mid-traps */}
    <path d="M 50,80 C 48,86 48,94 52,100 L 80,98 L 108,100 C 112,94 112,86 110,80 Z" fill="#bfc9d1" stroke="#94a3b8" strokeWidth="0.4" />
    {/* Spine line */}
    <line x1="80" y1="66" x2="80" y2="162" stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="2,2" opacity="0.5" />
    {/* Lats Left */}
    <path d="M 42,80 C 38,90 38,110 42,126 L 52,140 L 62,144 L 60,118 L 52,96 L 46,80 Z" fill="#b8c4ce" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Lats Right */}
    <path d="M 118,80 C 122,90 122,110 118,126 L 108,140 L 98,144 L 100,118 L 108,96 L 114,80 Z" fill="#b8c4ce" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Lower back erectors */}
    <path d="M 68,132 L 72,160 L 80,162 L 88,160 L 92,132 L 84,130 Z" fill="#c5cdd5" stroke="#94a3b8" strokeWidth="0.4" />

    {/* GLUTES */}
    <path d="M 44,158 C 40,164 38,174 42,182 L 54,192 L 80,194 L 106,192 L 118,182 C 122,174 120,164 116,158 Z" fill="#c8d0d8" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Glute split */}
    <path d="M 80,162 L 80,192" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
    {/* Left glute definition */}
    <path d="M 44,162 C 40,170 40,180 46,188 L 80,192 L 80,166 Z" fill="#bbc5cf" opacity="0.5" />
    {/* Right glute */}
    <path d="M 116,162 C 120,170 120,180 114,188 L 80,192 L 80,166 Z" fill="#bbc5cf" opacity="0.5" />

    {/* LEFT LEG (back) */}
    <path d="M 44,188 C 38,192 34,202 36,216 L 40,234 C 44,244 54,248 62,244 L 70,238 C 74,228 74,214 70,202 L 64,192 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Hamstring left */}
    <path d="M 44,192 C 40,200 40,216 44,228 L 54,238 L 62,236 L 60,216 L 52,200 Z" fill="#bfc9d1" opacity="0.7" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Left Knee (back) */}
    <ellipse cx="52" cy="248" rx="14" ry="8" fill="#c5cdd5" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Left Calf (back, gastrocnemius) */}
    <path d="M 40,256 C 36,260 36,272 40,282 L 46,290 C 52,294 62,290 66,282 L 68,268 C 68,256 56,252 40,256 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Gastrocnemius left definition */}
    <path d="M 40,260 C 38,266 40,274 46,280 L 54,284 L 60,278 L 56,266 L 48,260 Z" fill="#bfc9d1" opacity="0.6" />
    {/* Left Foot */}
    <path d="M 38,286 C 34,288 32,292 38,294 L 56,294 L 64,290 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />

    {/* RIGHT LEG (back) */}
    <path d="M 116,188 C 122,192 126,202 124,216 L 120,234 C 116,244 106,248 98,244 L 90,238 C 86,228 86,214 90,202 L 96,192 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.6" />
    {/* Hamstring right */}
    <path d="M 116,192 C 120,200 120,216 116,228 L 106,238 L 98,236 L 100,216 L 108,200 Z" fill="#bfc9d1" opacity="0.7" stroke="#90a4ae" strokeWidth="0.4" />
    {/* Right Knee (back) */}
    <ellipse cx="108" cy="248" rx="14" ry="8" fill="#c5cdd5" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Right Calf (back) */}
    <path d="M 120,256 C 124,260 124,272 120,282 L 114,290 C 108,294 98,290 94,282 L 92,268 C 92,256 104,252 120,256 Z" fill="url(#bodyGradB)" stroke="#94a3b8" strokeWidth="0.5" />
    {/* Gastrocnemius right */}
    <path d="M 120,260 C 122,266 120,274 114,280 L 106,284 L 100,278 L 104,266 L 112,260 Z" fill="#bfc9d1" opacity="0.6" />
    {/* Right Foot */}
    <path d="M 122,286 C 126,288 128,292 122,294 L 104,294 L 96,290 Z" fill="#d4b896" stroke="#b8976a" strokeWidth="0.5" />

    {/* MUSCLE HIGHLIGHT */}
    {highlight && (
      <path
        d={highlight.path}
        fill={highlight.color}
        opacity="0.72"
        style={{ animation: 'pulse 1.5s ease-in-out infinite alternate' }}
      />
    )}

    <style>{`
      @keyframes pulse {
        from { opacity: 0.55; }
        to { opacity: 0.85; }
      }
    `}</style>
  </svg>
);

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
  const mainColor = highlight?.color || '#94a3b8';

  const frontHighlight = highlight?.front ? { path: highlight.front, color: mainColor } : undefined;
  const backHighlight = highlight?.back ? { path: highlight.back, color: mainColor } : undefined;

  return (
    <div className={`flex gap-2 items-center justify-center py-3 px-2 ${className}`}>
      {/* Front view */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Frontal</span>
        <BodyFrontSVG highlight={frontHighlight} />
      </div>

      {/* Back view */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Posterior</span>
        <BodyBackSVG highlight={backHighlight} />
      </div>

      {/* Label */}
      <div className="flex flex-col items-start gap-2 ml-1">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm"
          style={{ backgroundColor: mainColor }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full bg-white/60 inline-block"
            style={{ animation: 'pulse 1.5s ease-in-out infinite alternate' }}
          />
          {highlight?.label || muscleGroup}
        </div>
        <p className="text-xs text-slate-500 max-w-[80px] leading-snug italic">{exerciseName}</p>
      </div>
    </div>
  );
};
