import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import type { PatientAnamnesis } from '../../types';
import { sendContractEmail, generateContractText } from '../../lib/email';
import {
  User, Heart, Activity, Utensils, AlertTriangle, Apple, ClipboardList,
  CheckCircle2, ChevronRight, ChevronLeft, FileText, Loader2,
} from 'lucide-react';

const EMPTY: PatientAnamnesis = {
  name: '', email: '', password: '', phone: '',
  birthDate: '', gender: 'male', weight: 70, height: 170, bodyFat: undefined,
  chronicDiseases: [], medications: '', surgeries: '', familyHistory: '',
  previousDiets: [], eatingDisorders: '', supplementsUsed: [],
  activityLevel: 'moderate', activityDescription: '',
  sleepHours: 7, stressLevel: 3,
  dietType: 'mediterranean', mealsPerDay: 3, mealSchedule: '',
  cookingSkill: 'basic', cookingTime: 'moderate', budget: 'medium',
  allergies: [], intolerances: [], dislikedFoods: [],
  goal: 'health', targetWeight: undefined, motivations: '',
  giIssues: [], hydrationLiters: 1.5, alcoholFrequency: 'rarely', caffeineIntake: 'moderate',
  notes: '',
};

const CHRONIC_DISEASES = ['Diabetes tipo 1', 'Diabetes tipo 2', 'Hipertensión', 'Colesterol alto', 'Triglicéridos altos', 'Hipotiroidismo', 'Hipertiroidismo', 'Síndrome de ovario poliquístico', 'Enfermedad celíaca', 'Enfermedad de Crohn', 'Colitis ulcerosa', 'Síndrome de intestino irritable', 'Reflujo gastroesofágico', 'Gastritis', 'Anemia', 'Osteoporosis', 'Artritis', 'Psoriasis', 'Migraña crónica', 'Asma', 'Depresión', 'Ansiedad', 'Insuficiencia renal', 'Hígado graso'];
const ALLERGIES = ['Gluten/Trigo', 'Lactosa/Leche', 'Huevos', 'Cacahuetes', 'Frutos secos de árbol', 'Mariscos y crustáceos', 'Moluscos', 'Pescado', 'Soja', 'Mostaza', 'Sésamo', 'Apio', 'Altramuz', 'Sulfitos', 'Colorantes alimentarios', 'Polen', 'Látex', 'Maíz', 'Levadura'];
const INTOLERANCES = ['Lactosa', 'Fructosa', 'Sorbitol', 'Histamina', 'Gluten (sensibilidad)', 'FODMAP', 'Salicilatos', 'Aminas biógenas', 'Tiramina', 'Cafeína', 'Alcohol', 'Níquel', 'SIBO', 'Síndrome intestino irritable', 'Caseína', 'Proteína de suero'];
const PREVIOUS_DIETS = ['Dieta hipocalórica', 'Dieta cetogénica', 'Mediterránea', 'Paleolítica', 'Disociada', 'Dukan', 'DASH', 'Macrobiótica', 'Ayuno intermitente', 'Vegana/Vegetariana', 'Baja en carbohidratos', 'Alta en proteínas', 'Sin dieta previa'];
const SUPPLEMENTS = ['Proteína Whey', 'Caseína', 'Proteína vegetal', 'Creatina', 'BCAA', 'Beta-alanina', 'Glutamina', 'Cafeína / Pre-entreno', 'Omega-3', 'Multivitamínico', 'Vitamina D', 'Vitamina C', 'Magnesio', 'Zinc', 'Hierro', 'B12', 'Colágeno', 'Probióticos', 'L-carnitina'];
const GI_ISSUES = ['Hinchazón abdominal', 'Gases excesivos', 'Estreñimiento', 'Diarrea frecuente', 'Reflujo ácido', 'Náuseas', 'Dolor abdominal', 'Digestiones lentas', 'Intolerancia a grasas', 'Pesadez postprandial'];
const DISLIKED_COMMON = ['Hígado y vísceras', 'Mariscos', 'Ostras', 'Pescado azul', 'Verduras hoja verde', 'Brócoli/Coliflor', 'Cebolla cruda', 'Ajo crudo', 'Pimientos', 'Berenjena', 'Remolacha', 'Setas', 'Legumbres', 'Tofu', 'Lácteos', 'Huevos duros', 'Fruta', 'Frutos secos', 'Picante'];

const steps = [
  { label: 'Datos', icon: User },
  { label: 'Médico', icon: Heart },
  { label: 'Vida', icon: Activity },
  { label: 'Alimentación', icon: Utensils },
  { label: 'Restricciones', icon: AlertTriangle },
  { label: 'Gustos', icon: Apple },
  { label: 'Objetivos', icon: ClipboardList },
  { label: 'Contrato', icon: FileText },
  { label: 'Confirmar', icon: CheckCircle2 },
];

export const AthleteCompleteSurvey: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, athletes, updateAthlete, completeAthleteAnamnesis } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PatientAnamnesis>(() => {
    const athlete = athletes.find(a => a.email?.toLowerCase() === currentUser?.email?.toLowerCase());
    return {
      ...EMPTY,
      name: currentUser?.name || '',
      email: currentUser?.email || '',
      phone: currentUser?.phone || athlete?.phone || '',
      weight: athlete?.weight || 70,
      height: athlete?.height || 170,
      gender: athlete?.gender || 'male',
      birthDate: athlete?.birthDate || '',
    };
  });
  const [contractAccepted, setContractAccepted] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [dislikedInput, setDislikedInput] = useState('');

  const athlete = athletes.find(a => a.email?.toLowerCase() === (currentUser?.email ?? '').toLowerCase());
  const totalSteps = steps.length;

  const up = <K extends keyof PatientAnamnesis>(key: K, val: PatientAnamnesis[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const toggleArr = (key: 'chronicDiseases' | 'allergies' | 'intolerances' | 'previousDiets' | 'supplementsUsed' | 'dislikedFoods' | 'giIssues', val: string) =>
    setForm(f => ({ ...f, [key]: f[key].includes(val) ? (f[key] as string[]).filter(v => v !== val) : [...(f[key] as string[]), val] }));

  const SelectChip: React.FC<{ items: string[]; selected: string[]; onToggle: (v: string) => void; color?: string }> = ({ items, selected, onToggle, color = 'blue' }) => {
    const activeClass = color === 'red' ? 'bg-red-500 text-white' : color === 'orange' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white';
    return (
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <button key={item} type="button" onClick={() => onToggle(item)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${selected.includes(item) ? `${activeClass} border-transparent` : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
            {item}
          </button>
        ))}
      </div>
    );
  };

  const handleSubmit = async () => {
    if (!contractAccepted) { setError('Debes aceptar el contrato de prestación de servicios.'); return; }
    if (!athlete) { setError('No se encontró tu ficha de deportista.'); return; }
    setSending(true);
    // Update athlete record with anamnesis data
    updateAthlete(athlete.id, {
      weight: form.weight,
      height: form.height,
      gender: form.gender,
      birthDate: form.birthDate,
      phone: form.phone,
      goals: form.motivations,
      medicalNotes: [
        form.chronicDiseases.length ? `Enfermedades: ${form.chronicDiseases.join(', ')}` : '',
        form.medications ? `Medicación: ${form.medications}` : '',
        form.allergies.length ? `Alergias: ${form.allergies.join(', ')}` : '',
        form.intolerances.length ? `Intolerancias: ${form.intolerances.join(', ')}` : '',
        form.notes ? `Notas: ${form.notes}` : '',
      ].filter(Boolean).join(' | '),
      anamnesisCompleted: true,
      contractAccepted: true,
      contractAcceptedAt: new Date().toISOString(),
    });
    completeAthleteAnamnesis(athlete.id);

    // Send contract email
    const acceptedAt = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
    const contractText = generateContractText(form.name, 'APD SPORT', acceptedAt);
    await sendContractEmail({
      to_email: form.email,
      to_name: form.name,
      trainer_name: 'APD SPORT',
      accepted_at: acceptedAt,
      contract_html: contractText,
    });
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">¡Ficha completada!</h2>
          <p className="text-slate-500 mb-6">Tu anamnesis ha sido registrada. Tu entrenador preparará tu plan personalizado.</p>
          <button onClick={() => navigate('/athlete/dashboard')} className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition">
            Ir a mi área
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Apple className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Completa tu Ficha</h1>
          <p className="text-slate-500 text-sm mt-1">Para acceder a tu área, necesitamos tu anamnesis inicial</p>
        </div>

        <div className="flex overflow-x-auto gap-1 pb-2 mb-6 justify-center">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-all ${i === step ? 'bg-green-600 text-white' : i < step ? 'bg-green-100 text-green-700' : 'bg-white text-slate-400'}`}>
              <s.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="h-1.5 bg-slate-200 rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-4">
          {/* Step 0: Personal data */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><User className="w-5 h-5 text-green-500" />Datos Personales</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
                  <input value={form.name} onChange={e => up('name', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input value={form.phone || ''} onChange={e => up('phone', e.target.value)} placeholder="+34 600 000 000" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de nacimiento</label>
                  <input type="date" value={form.birthDate || ''} onChange={e => up('birthDate', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Género</label>
                  <div className="flex gap-2">
                    {(['male', 'female', 'other'] as const).map(g => (
                      <button key={g} type="button" onClick={() => up('gender', g)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.gender === g ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {g === 'male' ? 'Hombre' : g === 'female' ? 'Mujer' : 'Otro'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso actual (kg)</label>
                  <input type="number" value={form.weight} min={30} max={250} step={0.5} onChange={e => up('weight', Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Altura (cm)</label>
                  <input type="number" value={form.height} min={100} max={230} onChange={e => up('height', Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">% Grasa corporal (opcional)</label>
                  <input type="number" value={form.bodyFat || ''} min={3} max={60} step={0.5} onChange={e => up('bodyFat', e.target.value ? Number(e.target.value) : undefined)} placeholder="Ej: 22" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Medical history */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Heart className="w-5 h-5 text-green-500" />Historia Médica</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Enfermedades crónicas</p>
                <SelectChip items={CHRONIC_DISEASES} selected={form.chronicDiseases} onToggle={v => toggleArr('chronicDiseases', v)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos habituales</label>
                <textarea value={form.medications} onChange={e => up('medications', e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cirugías previas</label>
                <textarea value={form.surgeries} onChange={e => up('surgeries', e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Antecedentes familiares</label>
                <textarea value={form.familyHistory} onChange={e => up('familyHistory', e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Problemas gastrointestinales</p>
                <SelectChip items={GI_ISSUES} selected={form.giIssues} onToggle={v => toggleArr('giIssues', v)} />
              </div>
            </div>
          )}

          {/* Step 2: Lifestyle */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-green-500" />Hábitos de Vida</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Nivel de actividad física</p>
                <div className="space-y-2">
                  {([
                    { k: 'sedentary', l: 'Sedentario', d: 'Trabajo de escritorio, apenas camino' },
                    { k: 'light', l: 'Ligeramente activo', d: '1-2 días/sem de ejercicio' },
                    { k: 'moderate', l: 'Moderadamente activo', d: '3-4 días/sem de ejercicio' },
                    { k: 'active', l: 'Muy activo', d: '5-6 días/sem de ejercicio intenso' },
                    { k: 'very_active', l: 'Extremadamente activo', d: 'Atleta o trabajo físico diario' },
                  ] as const).map(opt => (
                    <button key={opt.k} type="button" onClick={() => up('activityLevel', opt.k)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition ${form.activityLevel === opt.k ? 'border-green-500 bg-green-50' : 'border-slate-100 hover:border-green-200'}`}>
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.activityLevel === opt.k ? 'border-green-500 bg-green-500' : 'border-slate-300'}`} />
                      <div><p className="text-sm font-medium text-slate-800">{opt.l}</p><p className="text-xs text-slate-400">{opt.d}</p></div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Describe tu actividad física</label>
                <textarea value={form.activityDescription} onChange={e => up('activityDescription', e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Horas de sueño: <strong>{form.sleepHours}h</strong></label>
                  <input type="range" min={4} max={12} step={0.5} value={form.sleepHours} onChange={e => up('sleepHours', Number(e.target.value))} className="w-full accent-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nivel de estrés: <strong>{form.stressLevel}/5</strong></label>
                  <input type="range" min={1} max={5} step={1} value={form.stressLevel} onChange={e => up('stressLevel', Number(e.target.value) as 1|2|3|4|5)} className="w-full accent-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hidratación: <strong>{form.hydrationLiters}L/día</strong></label>
                  <input type="range" min={0.5} max={4} step={0.25} value={form.hydrationLiters} onChange={e => up('hydrationLiters', Number(e.target.value))} className="w-full accent-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Alcohol</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['never', 'rarely', 'weekly', 'daily'] as const).map(a => (
                      <button key={a} type="button" onClick={() => up('alcoholFrequency', a)} className={`py-2 rounded-lg text-xs font-medium border-2 transition ${form.alcoholFrequency === a ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ never: 'Nunca', rarely: 'Raramente', weekly: 'Semanal', daily: 'Diario' }[a]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Diet */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Utensils className="w-5 h-5 text-green-500" />Hábitos Alimentarios</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Tipo de alimentación</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { k: 'mediterranean', l: 'Mediterránea' },
                    { k: 'omnivore', l: 'Omnívora' },
                    { k: 'vegetarian', l: 'Vegetariana' },
                    { k: 'vegan', l: 'Vegana' },
                    { k: 'pescetarian', l: 'Pescetariana' },
                    { k: 'other', l: 'Otra' },
                  ] as const).map(opt => (
                    <button key={opt.k} type="button" onClick={() => up('dietType', opt.k)} className={`p-2.5 rounded-xl border-2 text-xs font-medium transition ${form.dietType === opt.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>{opt.l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Comidas al día: <strong>{form.mealsPerDay}</strong></label>
                  <div className="flex gap-2">{[2,3,4,5,6].map(n => (
                    <button key={n} type="button" onClick={() => up('mealsPerDay', n)} className={`w-10 h-10 rounded-xl text-sm font-semibold transition ${form.mealsPerDay === n ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{n}</button>
                  ))}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Presupuesto</label>
                  <div className="flex gap-2">
                    {(['low','medium','high'] as const).map(b => (
                      <button key={b} type="button" onClick={() => up('budget', b)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.budget === b ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ low: 'Ajustado', medium: 'Moderado', high: 'Sin límite' }[b]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Dietas anteriores</p>
                <SelectChip items={PREVIOUS_DIETS} selected={form.previousDiets} onToggle={v => toggleArr('previousDiets', v)} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Suplementos actuales</p>
                <SelectChip items={SUPPLEMENTS} selected={form.supplementsUsed} onToggle={v => toggleArr('supplementsUsed', v)} />
              </div>
            </div>
          )}

          {/* Step 4: Allergies */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-green-500" />Alergias e Intolerancias</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Es importante indicar con precisión tus alergias e intolerancias para garantizar tu seguridad.
              </div>
              <div>
                <p className="text-sm font-semibold text-red-600 mb-2">Alergias alimentarias</p>
                <SelectChip items={ALLERGIES} selected={form.allergies} onToggle={v => toggleArr('allergies', v)} color="red" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-600 mb-2">Intolerancias</p>
                <SelectChip items={INTOLERANCES} selected={form.intolerances} onToggle={v => toggleArr('intolerances', v)} color="orange" />
              </div>
            </div>
          )}

          {/* Step 5: Food preferences */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Apple className="w-5 h-5 text-green-500" />Gustos Alimentarios</h2>
              <SelectChip items={DISLIKED_COMMON} selected={form.dislikedFoods} onToggle={v => toggleArr('dislikedFoods', v)} />
              <div className="flex gap-2">
                <input value={dislikedInput} onChange={e => setDislikedInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && dislikedInput.trim()) { toggleArr('dislikedFoods', dislikedInput.trim()); setDislikedInput(''); }}}
                  placeholder="Añadir otro alimento y pulsar Enter" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                <button type="button" onClick={() => { if (dislikedInput.trim()) { toggleArr('dislikedFoods', dislikedInput.trim()); setDislikedInput(''); }}} className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium">Añadir</button>
              </div>
            </div>
          )}

          {/* Step 6: Goals */}
          {step === 6 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-green-500" />Objetivos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  { k: 'lose_weight', l: 'Perder Grasa' },
                  { k: 'maintain', l: 'Mantenimiento' },
                  { k: 'gain_muscle', l: 'Ganar Músculo' },
                  { k: 'performance', l: 'Rendimiento' },
                  { k: 'health', l: 'Salud' },
                  { k: 'other', l: 'Otro' },
                ] as const).map(opt => (
                  <button key={opt.k} type="button" onClick={() => up('goal', opt.k)} className={`p-3 rounded-xl border-2 text-xs font-medium transition ${form.goal === opt.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>{opt.l}</button>
                ))}
              </div>
              {(form.goal === 'lose_weight' || form.goal === 'gain_muscle') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso objetivo (kg)</label>
                  <input type="number" value={form.targetWeight || ''} min={30} max={250} step={0.5} onChange={e => up('targetWeight', e.target.value ? Number(e.target.value) : undefined)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">¿Qué te motiva?</label>
                <textarea value={form.motivations} onChange={e => up('motivations', e.target.value)} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas para el profesional</label>
                <textarea value={form.notes} onChange={e => up('notes', e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
            </div>
          )}

          {/* Step 7: Contract */}
          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-green-500" />Contrato de Prestación de Servicios</h2>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-64 overflow-y-auto text-xs text-slate-600 leading-relaxed space-y-3">
                <p className="font-bold text-sm text-slate-800 text-center">CONTRATO DE PRESTACIÓN DE SERVICIOS NUTRICIONALES Y DEPORTIVOS</p>
                <p className="text-center text-slate-500">APD SPORT · info@apdsport.com</p>
                <p><strong>1. OBJETO:</strong> APD SPORT prestará servicios de nutrición deportiva y planificación de entrenamiento personalizado, en base a los datos de la anamnesis inicial.</p>
                <p><strong>2. SERVICIOS INCLUIDOS:</strong> Plan nutricional personalizado, planes de entrenamiento, acceso a plataforma digital, revisiones periódicas y chat con el profesional asignado.</p>
                <p><strong>3. OBLIGACIONES DEL CLIENTE:</strong> Proporcionar datos verídicos, consultar con médico ante condiciones de salud, informar cambios relevantes.</p>
                <p><strong>4. PROTECCIÓN DE DATOS (RGPD):</strong> Los datos personales serán tratados para prestar los servicios contratados. No serán cedidos a terceros. Derechos de acceso, rectificación y supresión en info@apdsport.com.</p>
                <p><strong>5. CONFIDENCIALIDAD:</strong> APD SPORT mantiene confidencialidad de toda información médica y personal.</p>
                <p><strong>6. VIGENCIA:</strong> Desde la fecha de aceptación hasta rescisión con preaviso de 7 días.</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={contractAccepted} onChange={e => { setContractAccepted(e.target.checked); setError(''); }} className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0" />
                <span className="text-sm text-slate-700">He leído y acepto el <strong>Contrato de Prestación de Servicios</strong> de APD SPORT y el tratamiento de mis datos conforme al RGPD.</span>
              </label>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                Una copia del contrato se enviará a <strong>{form.email}</strong> desde info@apdsport.com.
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}

          {/* Step 8: Confirm */}
          {step === 8 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" />Resumen</h2>
              <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-slate-600">👤 <strong>{form.name}</strong> · {form.email}</p>
                <p className="text-slate-600">⚖️ {form.weight}kg · {form.height}cm</p>
                <p className="text-slate-600">🎯 Objetivo: <strong>{{ lose_weight: 'Perder Grasa', maintain: 'Mantenimiento', gain_muscle: 'Ganar Músculo', performance: 'Rendimiento', health: 'Salud', other: 'Otro' }[form.goal]}</strong></p>
                <p className="text-slate-600">🥗 Dieta: <strong>{{ mediterranean: 'Mediterránea', omnivore: 'Omnívora', vegetarian: 'Vegetariana', vegan: 'Vegana', pescetarian: 'Pescetariana', other: 'Otra' }[form.dietType]}</strong></p>
                {form.allergies.length > 0 && <p className="text-red-600">🚨 Alergias: {form.allergies.join(', ')}</p>}
                {form.intolerances.length > 0 && <p className="text-orange-600">⚠️ Intolerancias: {form.intolerances.join(', ')}</p>}
                <p className="text-green-700">✅ Contrato aceptado</p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition">
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          {step < totalSteps - 1 ? (
            <button type="button"
              onClick={() => {
                if (step === 7 && !contractAccepted) { setError('Debes aceptar el contrato para continuar.'); return; }
                setError('');
                setStep(s => s + 1);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={sending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-95 shadow transition disabled:opacity-60">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><CheckCircle2 className="w-4 h-4" /> Completar Ficha</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
