import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { PatientAnamnesis } from '../types';
import { sendContractEmail, generateContractText } from '../lib/email';
import {
  User, Mail, Lock, Phone, Scale, Ruler, ChevronRight, ChevronLeft,
  CheckCircle2, Heart, Apple, Activity, Utensils, AlertTriangle, ClipboardList,
  FileText, Loader2,
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

const ALLERGIES = ['Gluten/Trigo', 'Lactosa/Leche', 'Huevos', 'Cacahuetes', 'Frutos secos de árbol (almendras, nueces…)', 'Mariscos y crustáceos', 'Moluscos (almejas, mejillones…)', 'Pescado', 'Soja', 'Mostaza', 'Sésamo', 'Apio', 'Altramuz (lupino)', 'Dióxido de azufre / Sulfitos', 'Colorantes alimentarios', 'Polen (reactividad cruzada con frutas)', 'Látex (kiwi, plátano, aguacate)', 'Maíz', 'Levadura'];

const INTOLERANCES = ['Lactosa', 'Fructosa', 'Sorbitol', 'Histamina', 'Gluten (no celiaquía / sensibilidad)', 'FODMAP', 'Salicilatos', 'Aminas biógenas (tiramina, histamina…)', 'Tiramina', 'Cafeína', 'Alcohol', 'Níquel', 'SIBO (sobrecrecimiento bacteriano)', 'Síndrome de intestino irritable (SII)', 'Caseína', 'Proteína de suero de leche (whey)', 'Triptaminas', 'Ácido oxálico', 'Ácido úrico (gota)', 'Fenilalanina (fenilcetonuria)'];

const PREVIOUS_DIETS = ['Dieta hipocalórica', 'Dieta cetogénica (keto)', 'Dieta mediterránea', 'Dieta paleolítica', 'Dieta disociada', 'Dieta Dukan', 'Dieta Weight Watchers', 'Dieta DASH', 'Dieta macrobiótica', 'Ayuno intermitente', 'Dieta vegana o vegetariana', 'Dieta baja en carbohidratos', 'Dieta alta en proteínas', 'Dieta antiinflamatoria', 'Plan de nutrición deportiva', 'Sin dieta previa específica'];

const SUPPLEMENTS = ['Proteína de suero de leche (Whey)', 'Caseína', 'Proteína vegetal', 'Creatina', 'BCAA', 'Beta-alanina', 'Glutamina', 'Cafeína / Pre-entreno', 'Omega-3 / Aceite de pescado', 'Multivitamínico', 'Vitamina D', 'Vitamina C', 'Magnesio', 'Zinc', 'Hierro', 'B12', 'Coenzima Q10', 'Colágeno', 'Probióticos', 'Melatonina', 'Ashwagandha', 'L-carnitina', 'CLA', 'HMB', 'Condroitina/Glucosamina'];

const GI_ISSUES = ['Hinchazón abdominal frecuente', 'Gases excesivos', 'Estreñimiento crónico', 'Diarrea frecuente', 'Reflujo ácido / Ardor', 'Náuseas frecuentes', 'Dolor abdominal tras comer', 'Digestiones muy lentas', 'Intolerancia a las grasas', 'Sensación de pesadez postprandial', 'Heces con moco', 'Urgencia defecatoria', 'Eructos frecuentes'];

const DISLIKED_COMMON = ['Hígado y vísceras', 'Mariscos', 'Ostras', 'Pescado azul (sardinas, caballa…)', 'Verduras de hoja verde (espinacas, acelgas)', 'Brócoli / Coliflor', 'Cebolla cruda', 'Ajo crudo', 'Pimientos', 'Berenjena', 'Remolacha', 'Hongos y setas', 'Legumbres', 'Tofu', 'Tempeh', 'Lácteos', 'Huevos duros', 'Fruta en general', 'Frutos secos', 'Picante', 'Alimentos muy dulces', 'Arroz integral', 'Pan integral'];

const steps = [
  { label: 'Datos Personales', icon: User },
  { label: 'Historia Médica', icon: Heart },
  { label: 'Hábitos de Vida', icon: Activity },
  { label: 'Alimentación', icon: Utensils },
  { label: 'Restricciones', icon: AlertTriangle },
  { label: 'Gustos', icon: Apple },
  { label: 'Objetivos', icon: ClipboardList },
  { label: 'Contrato', icon: FileText },
  { label: 'Confirmación', icon: CheckCircle2 },
];

export const PatientRegister: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { getPendingPatient, registerPatientFromAnamnesis } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PatientAnamnesis>({ ...EMPTY });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [dislikedInput, setDislikedInput] = useState('');
  const [pending, setPending] = useState<ReturnType<typeof getPendingPatient>>(undefined);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    // 1. Try to decode invite data embedded in URL (works cross-device)
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(token))));
      if (decoded && decoded.trainerId) {
        // Check expiry
        if (decoded.expiresAt && new Date(decoded.expiresAt) < new Date()) {
          return; // expired — pending stays undefined → shows invalid screen
        }
        setPending(decoded);
        setForm(f => ({ ...f, name: decoded.prefilledName || '', email: decoded.prefilledEmail || '', phone: decoded.phone || '' }));
        return;
      }
    } catch {
      // Not base64 — fall through to localStorage lookup
    }
    // 2. Fallback: lookup by token in localStorage (same-browser invites)
    const p = getPendingPatient(token);
    setPending(p);
    if (p) {
      setForm(f => ({ ...f, name: p.prefilledName || '', email: p.prefilledEmail || '', phone: p.phone || '' }));
    }
  }, [token]);

  const up = <K extends keyof PatientAnamnesis>(key: K, val: PatientAnamnesis[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const toggleArr = (key: 'chronicDiseases' | 'allergies' | 'intolerances' | 'previousDiets' | 'supplementsUsed' | 'dislikedFoods' | 'giIssues', val: string) =>
    setForm(f => ({ ...f, [key]: f[key].includes(val) ? (f[key] as string[]).filter(v => v !== val) : [...(f[key] as string[]), val] }));

  const handleSubmit = async () => {
    if (!token) return;
    if (form.password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (!contractAccepted) { setError('Debes aceptar el contrato de prestación de servicios.'); return; }
    setSending(true);
    const ok = registerPatientFromAnamnesis(pending ?? token ?? '', { ...form, contractAccepted: true });
    if (ok) {
      // Send contract email
      const acceptedAt = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' });
      const trainerName = pending?.trainerId ? 'APD SPORT' : 'APD SPORT';
      const contractText = generateContractText(form.name, trainerName, acceptedAt);
      await sendContractEmail({
        to_email: form.email,
        to_name: form.name,
        trainer_name: trainerName,
        accepted_at: acceptedAt,
        contract_html: contractText,
      });
      setSending(false);
      setDone(true);
    } else {
      setSending(false);
      setError('Ya existe una cuenta con ese email. Contacta con tu entrenador.');
    }
  };

  if (!pending && token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Enlace no válido</h2>
          <p className="text-slate-500 text-sm">Este enlace de registro ha expirado o no es válido. Solicita un nuevo enlace a tu entrenador.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">¡Registro completado!</h2>
          <p className="text-slate-500 mb-6">Tu ficha ha sido creada. Tu entrenador/nutricionista recibirá tus datos para preparar tu plan personalizado.</p>
          <button onClick={() => navigate('/login')} className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition">
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  const totalSteps = steps.length;

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Apple className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Ficha Nutricional y de Salud</h1>
          <p className="text-slate-500 text-sm mt-1">Rellena tu anamnesis completa para personalizar tu plan</p>
        </div>

        {/* Steps */}
        <div className="flex overflow-x-auto gap-1 pb-2 mb-6 scrollbar-hide justify-center">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-all ${i === step ? 'bg-green-600 text-white' : i < step ? 'bg-green-100 text-green-700' : 'bg-white text-slate-400'}`}>
              <s.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="h-1.5 bg-slate-200 rounded-full mb-6 overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-4">

          {/* STEP 0: Datos personales */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><User className="w-5 h-5 text-green-500" />Datos Personales</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
                  <input value={form.name} onChange={e => up('name', e.target.value)} placeholder="Nombre y apellidos" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => up('email', e.target.value)} placeholder="correo@ejemplo.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input value={form.phone || ''} onChange={e => up('phone', e.target.value)} placeholder="+34 600 000 000" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña *</label>
                  <input type="password" value={form.password} onChange={e => up('password', e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Repetir contraseña *</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de nacimiento</label>
                  <input type="date" value={form.birthDate || ''} onChange={e => up('birthDate', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Género *</label>
                  <div className="flex gap-2">
                    {(['male', 'female', 'other'] as const).map(g => (
                      <button key={g} type="button" onClick={() => up('gender', g)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.gender === g ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {g === 'male' ? 'Hombre' : g === 'female' ? 'Mujer' : 'Otro'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso actual (kg) *</label>
                  <input type="number" value={form.weight} min={30} max={250} step={0.5} onChange={e => up('weight', Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Altura (cm) *</label>
                  <input type="number" value={form.height} min={100} max={230} onChange={e => up('height', Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">% Grasa corporal (si lo conoces)</label>
                  <input type="number" value={form.bodyFat || ''} min={3} max={60} step={0.5} onChange={e => up('bodyFat', e.target.value ? Number(e.target.value) : undefined)} placeholder="Ej: 22" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: Historia médica */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Heart className="w-5 h-5 text-green-500" />Historia Médica</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Enfermedades o condiciones crónicas (selecciona todas las que apliquen)</p>
                <SelectChip items={CHRONIC_DISEASES} selected={form.chronicDiseases} onToggle={v => toggleArr('chronicDiseases', v)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medicamentos que tomas habitualmente</label>
                <textarea value={form.medications} onChange={e => up('medications', e.target.value)} placeholder="Indica nombre y dosis si es posible" rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cirugías previas relevantes</label>
                <textarea value={form.surgeries} onChange={e => up('surgeries', e.target.value)} placeholder="Ej: bypass gástrico, colecistectomía, tiroidectomía..." rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Antecedentes familiares relevantes</label>
                <textarea value={form.familyHistory} onChange={e => up('familyHistory', e.target.value)} placeholder="Diabetes, enfermedades cardíacas, obesidad en familia..." rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Problemas gastrointestinales habituales</p>
                <SelectChip items={GI_ISSUES} selected={form.giIssues} onToggle={v => toggleArr('giIssues', v)} />
              </div>
            </div>
          )}

          {/* STEP 2: Hábitos de vida */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-green-500" />Hábitos de Vida</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Nivel de actividad física *</p>
                <div className="space-y-2">
                  {([
                    { k: 'sedentary', l: 'Sedentario', d: 'Trabajo de escritorio, apenas camino' },
                    { k: 'light', l: 'Ligeramente activo', d: '1-2 días/sem de ejercicio suave o muchos pasos' },
                    { k: 'moderate', l: 'Moderadamente activo', d: '3-4 días/sem de ejercicio' },
                    { k: 'active', l: 'Muy activo', d: '5-6 días/sem de ejercicio intenso' },
                    { k: 'very_active', l: 'Extremadamente activo', d: 'Atleta o trabajo físico diario intenso' },
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Describe tu actividad física (deporte, frecuencia, duración...)</label>
                <textarea value={form.activityDescription} onChange={e => up('activityDescription', e.target.value)} placeholder="Ej: Gimnasio 4 días/semana, 1h, pesas + cardio. Camino 30 min diarios." rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Horas de sueño (promedio): <strong>{form.sleepHours}h</strong></label>
                  <input type="range" min={4} max={12} step={0.5} value={form.sleepHours} onChange={e => up('sleepHours', Number(e.target.value))} className="w-full accent-green-500" />
                  <div className="flex justify-between text-xs text-slate-400"><span>4h</span><span>12h</span></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nivel de estrés (1=mínimo, 5=máximo): <strong>{form.stressLevel}/5</strong></label>
                  <input type="range" min={1} max={5} step={1} value={form.stressLevel} onChange={e => up('stressLevel', Number(e.target.value) as 1 | 2 | 3 | 4 | 5)} className="w-full accent-green-500" />
                  <div className="flex justify-between text-xs text-slate-400"><span>Mínimo</span><span>Máximo</span></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Litros de agua al día: <strong>{form.hydrationLiters}L</strong></label>
                  <input type="range" min={0.5} max={4} step={0.25} value={form.hydrationLiters} onChange={e => up('hydrationLiters', Number(e.target.value))} className="w-full accent-green-500" />
                  <div className="flex justify-between text-xs text-slate-400"><span>0.5L</span><span>4L</span></div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Consumo de alcohol</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['never', 'rarely', 'weekly', 'daily'] as const).map(a => (
                      <button key={a} type="button" onClick={() => up('alcoholFrequency', a)} className={`py-2 rounded-lg text-xs font-medium border-2 transition ${form.alcoholFrequency === a ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ never: 'Nunca', rarely: 'Raramente', weekly: 'Semanal', daily: 'Diario' }[a]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Consumo de cafeína</label>
                <div className="flex gap-2">
                  {(['none', 'low', 'moderate', 'high'] as const).map(c => (
                    <button key={c} type="button" onClick={() => up('caffeineIntake', c)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.caffeineIntake === c ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                      {{ none: 'Ninguna', low: 'Baja', moderate: 'Moderada', high: 'Alta' }[c]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Hábitos alimentarios */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Utensils className="w-5 h-5 text-green-500" />Hábitos Alimentarios</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Tipo de alimentación *</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { k: 'mediterranean', l: 'Mediterránea' },
                    { k: 'omnivore', l: 'Omnívora (todo)' },
                    { k: 'vegetarian', l: 'Vegetariana' },
                    { k: 'vegan', l: 'Vegana' },
                    { k: 'pescetarian', l: 'Pescetariana' },
                    { k: 'other', l: 'Otra / Mixta' },
                  ] as const).map(opt => (
                    <button key={opt.k} type="button" onClick={() => up('dietType', opt.k)} className={`p-2.5 rounded-xl border-2 text-xs font-medium transition ${form.dietType === opt.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500 hover:border-green-200'}`}>{opt.l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Comidas al día: <strong>{form.mealsPerDay}</strong></label>
                  <div className="flex gap-2">{[2, 3, 4, 5, 6].map(n => (
                    <button key={n} type="button" onClick={() => up('mealsPerDay', n)} className={`w-10 h-10 rounded-xl text-sm font-semibold transition ${form.mealsPerDay === n ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-green-100'}`}>{n}</button>
                  ))}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Presupuesto semanal para alimentación</label>
                  <div className="flex gap-2">
                    {(['low', 'medium', 'high'] as const).map(b => (
                      <button key={b} type="button" onClick={() => up('budget', b)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.budget === b ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ low: 'Ajustado', medium: 'Moderado', high: 'Sin límite' }[b]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nivel de cocina</label>
                  <div className="flex gap-1.5">
                    {(['none', 'basic', 'intermediate', 'advanced'] as const).map(c => (
                      <button key={c} type="button" onClick={() => up('cookingSkill', c)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.cookingSkill === c ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ none: 'Nulo', basic: 'Básico', intermediate: 'Medio', advanced: 'Avanzado' }[c]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tiempo disponible para cocinar</label>
                  <div className="flex gap-2">
                    {(['minimal', 'moderate', 'extensive'] as const).map(t => (
                      <button key={t} type="button" onClick={() => up('cookingTime', t)} className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition ${form.cookingTime === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'}`}>
                        {{ minimal: '<20 min', moderate: 'Moderado', extensive: 'Sin límite' }[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Horarios habituales de comidas</label>
                <input value={form.mealSchedule} onChange={e => up('mealSchedule', e.target.value)} placeholder="Ej: Desayuno 8h, comida 14h, cena 21h" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Dietas que has seguido anteriormente</p>
                <SelectChip items={PREVIOUS_DIETS} selected={form.previousDiets} onToggle={v => toggleArr('previousDiets', v)} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Suplementos que tomas actualmente</p>
                <SelectChip items={SUPPLEMENTS} selected={form.supplementsUsed} onToggle={v => toggleArr('supplementsUsed', v)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Relación con la comida / Trastornos alimentarios previos (opcional)</label>
                <textarea value={form.eatingDisorders} onChange={e => up('eatingDisorders', e.target.value)} placeholder="Describe si has tenido ansiedad por la comida, atracones, restricción severa, etc." rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
            </div>
          )}

          {/* STEP 4: Alergias e intolerancias */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-green-500" />Alergias e Intolerancias</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Es importante que indiques con precisión tus alergias e intolerancias para garantizar tu seguridad y bienestar.
              </div>
              <div>
                <p className="text-sm font-semibold text-red-600 mb-2">Alergias alimentarias (reacción inmunológica)</p>
                <SelectChip items={ALLERGIES} selected={form.allergies} onToggle={v => toggleArr('allergies', v)} color="red" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-600 mb-2">Intolerancias alimentarias (malestar digestivo)</p>
                <SelectChip items={INTOLERANCES} selected={form.intolerances} onToggle={v => toggleArr('intolerances', v)} color="orange" />
              </div>
            </div>
          )}

          {/* STEP 5: Alimentos descartados por gusto */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Apple className="w-5 h-5 text-green-500" />Gustos Alimentarios</h2>
              <p className="text-sm text-slate-500">Indica los alimentos que NO te gustan o prefieres evitar por cuestión de gusto (no alergia).</p>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Selecciona los que apliquen</p>
                <SelectChip items={DISLIKED_COMMON} selected={form.dislikedFoods} onToggle={v => toggleArr('dislikedFoods', v)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Añadir otros alimentos que no te gustan</label>
                <div className="flex gap-2">
                  <input value={dislikedInput} onChange={e => setDislikedInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && dislikedInput.trim()) { toggleArr('dislikedFoods', dislikedInput.trim()); setDislikedInput(''); } }}
                    placeholder="Escribe y pulsa Enter" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                  <button type="button" onClick={() => { if (dislikedInput.trim()) { toggleArr('dislikedFoods', dislikedInput.trim()); setDislikedInput(''); } }} className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition">Añadir</button>
                </div>
                {form.dislikedFoods.filter(f => !DISLIKED_COMMON.includes(f)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.dislikedFoods.filter(f => !DISLIKED_COMMON.includes(f)).map(f => (
                      <span key={f} className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs">
                        {f}
                        <button type="button" onClick={() => toggleArr('dislikedFoods', f)} className="text-slate-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 6: Objetivos */}
          {step === 6 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-green-500" />Objetivos de Salud y Nutrición</h2>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Objetivo principal *</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { k: 'lose_weight', l: 'Perder Grasa' },
                    { k: 'maintain', l: 'Mantenimiento' },
                    { k: 'gain_muscle', l: 'Ganar Músculo' },
                    { k: 'performance', l: 'Rendimiento Deportivo' },
                    { k: 'health', l: 'Mejorar la Salud' },
                    { k: 'other', l: 'Otro' },
                  ] as const).map(opt => (
                    <button key={opt.k} type="button" onClick={() => up('goal', opt.k)} className={`p-3 rounded-xl border-2 text-xs font-medium transition ${form.goal === opt.k ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500 hover:border-green-200'}`}>{opt.l}</button>
                  ))}
                </div>
              </div>
              {(form.goal === 'lose_weight' || form.goal === 'gain_muscle') && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso objetivo (kg)</label>
                  <input type="number" value={form.targetWeight || ''} min={30} max={250} step={0.5} onChange={e => up('targetWeight', e.target.value ? Number(e.target.value) : undefined)} placeholder="Ej: 70" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">¿Qué te motiva a cambiar tus hábitos?</label>
                <textarea value={form.motivations} onChange={e => up('motivations', e.target.value)} placeholder="Cuéntame por qué quieres mejorar tu alimentación y qué esperas conseguir..." rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas adicionales para el profesional</label>
                <textarea value={form.notes} onChange={e => up('notes', e.target.value)} placeholder="Cualquier información adicional que consideres relevante..." rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none" />
              </div>
            </div>
          )}

          {/* STEP 7: Contrato de Prestación de Servicios */}
          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-green-500" />Contrato de Prestación de Servicios</h2>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-72 overflow-y-auto text-xs text-slate-600 leading-relaxed space-y-3">
                <p className="font-bold text-sm text-slate-800 text-center">CONTRATO DE PRESTACIÓN DE SERVICIOS NUTRICIONALES Y DEPORTIVOS</p>
                <p className="text-center text-slate-500">APD SPORT · info@apdsport.com</p>
                <p><strong>PARTES:</strong></p>
                <p>• <strong>PRESTADOR:</strong> APD SPORT (info@apdsport.com)</p>
                <p>• <strong>CLIENTE:</strong> {form.name || '[Tu nombre]'}</p>
                <p><strong>1. OBJETO DEL CONTRATO</strong></p>
                <p>APD SPORT se compromete a prestar servicios de nutrición deportiva y planificación de entrenamiento personalizado al cliente, en base a los datos aportados en la ficha de anamnesis inicial.</p>
                <p><strong>2. SERVICIOS INCLUIDOS</strong></p>
                <p>• Elaboración de plan nutricional personalizado adaptado a los objetivos del deportista.<br/>• Elaboración y seguimiento de planes de entrenamiento.<br/>• Acceso a la plataforma digital APD SPORT para consulta de planes y comunicación con el profesional.<br/>• Revisiones periódicas y ajustes del plan según evolución.<br/>• Chat directo con el/la nutricionista/entrenador/a asignado/a.</p>
                <p><strong>3. OBLIGACIONES DEL CLIENTE</strong></p>
                <p>• Proporcionar datos verídicos en la ficha de salud y nutrición.<br/>• Consultar con su médico antes de iniciar cualquier programa si padece condiciones de salud.<br/>• Informar al profesional de cualquier cambio relevante en su estado de salud.</p>
                <p><strong>4. PROTECCIÓN DE DATOS (RGPD)</strong></p>
                <p>De conformidad con el Reglamento General de Protección de Datos (UE) 2016/679, APD SPORT informa que los datos personales facilitados serán tratados con la finalidad de prestar los servicios contratados. Los datos no serán cedidos a terceros salvo obligación legal. El cliente puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad contactando en info@apdsport.com.</p>
                <p><strong>5. CONFIDENCIALIDAD</strong></p>
                <p>APD SPORT se compromete a mantener la confidencialidad de toda la información médica y personal del cliente, no divulgándola sin su consentimiento expreso.</p>
                <p><strong>6. VIGENCIA</strong></p>
                <p>El contrato estará vigente desde la fecha de aceptación hasta que cualquiera de las partes lo rescinda con un preaviso de 7 días.</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={contractAccepted}
                  onChange={e => { setContractAccepted(e.target.checked); setError(''); }}
                  className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"
                />
                <span className="text-sm text-slate-700">
                  He leído, comprendido y acepto íntegramente las condiciones del <strong>Contrato de Prestación de Servicios</strong> de APD SPORT. Autorizo el tratamiento de mis datos personales conforme al RGPD.
                </span>
              </label>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                Una copia del contrato aceptado se enviará automáticamente a tu correo <strong>{form.email || 'indicado'}</strong> desde info@apdsport.com.
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}

          {/* STEP 8: Confirmación */}
          {step === 8 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" />Resumen y Confirmación</h2>
              <div className="space-y-3 text-sm">
                <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                  <p className="text-slate-600">👤 <strong>{form.name}</strong> · {form.email}</p>
                  <p className="text-slate-600">⚖️ {form.weight}kg · {form.height}cm · {form.gender === 'male' ? 'Hombre' : form.gender === 'female' ? 'Mujer' : 'Otro'}</p>
                  <p className="text-slate-600">🎯 Objetivo: <strong>{{ lose_weight: 'Perder Grasa', maintain: 'Mantenimiento', gain_muscle: 'Ganar Músculo', performance: 'Rendimiento', health: 'Salud', other: 'Otro' }[form.goal]}</strong></p>
                  <p className="text-slate-600">🥗 Dieta: <strong>{{ mediterranean: 'Mediterránea', omnivore: 'Omnívora', vegetarian: 'Vegetariana', vegan: 'Vegana', pescetarian: 'Pescetariana', other: 'Otra' }[form.dietType]}</strong></p>
                  <p className="text-slate-600">🍽️ {form.mealsPerDay} comidas/día · Actividad: <strong>{{ sedentary: 'Sedentario', light: 'Ligero', moderate: 'Moderado', active: 'Activo', very_active: 'Muy activo' }[form.activityLevel]}</strong></p>
                  {form.allergies.length > 0 && <p className="text-red-600">🚨 Alergias: {form.allergies.join(', ')}</p>}
                  {form.intolerances.length > 0 && <p className="text-orange-600">⚠️ Intolerancias: {form.intolerances.join(', ')}</p>}
                  {form.chronicDiseases.length > 0 && <p className="text-slate-600">🏥 Condiciones: {form.chronicDiseases.join(', ')}</p>}
                  {form.dislikedFoods.length > 0 && <p className="text-slate-600">❌ No le gusta: {form.dislikedFoods.slice(0, 5).join(', ')}{form.dislikedFoods.length > 5 ? '...' : ''}</p>}
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
                  Al enviar este formulario, autorizas al profesional a utilizar estos datos para elaborar tu plan nutricional y de entrenamiento personalizado, conforme al RGPD.
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}
        </div>

        {/* Navigation */}
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
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><CheckCircle2 className="w-4 h-4" /> Enviar Ficha</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
