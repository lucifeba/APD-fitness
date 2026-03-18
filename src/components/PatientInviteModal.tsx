import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, MessageCircle, Copy, CheckCircle2, User, Mail, Phone, Info, Send } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const SENDER_WHATSAPP = '+34676002647';
const SENDER_EMAIL = 'info@apdsport.com';

function buildWhatsAppMessage(name: string, link: string): string {
  const greeting = name ? ` ${name}` : '';
  return `👋 ¡Hola${greeting}!

Soy tu entrenador de *APD SPORT* 💪

Te envío tu enlace personalizado para completar tu ficha de salud y nutrición. ¡Es el primer paso para preparar tu plan 100% a medida! ✅

📎 *TU ENLACE DE REGISTRO:*
${link}

----------------------------
📝 *¿QUÉ OCURRE DESPUÉS?*
----------------------------

1. *Rellena tu ficha* ✏️
Accede al enlace y completa el formulario con tus datos de salud y objetivos. Solo 5-10 minutos.

2. *Recibe el contrato* 📋
Al finalizar, te enviamos automáticamente el contrato a tu correo.

3. *Activamos tu cuenta* 🔑
Tu entrenador revisará tu ficha y te avisará cuando esté todo listo.

4. *Tu plan personalizado* 💪
Nutrición y/o entrenamiento diseñados específicamente para tus objetivos.

5. *Seguimiento continuo* 📊
Desde la app: consulta tus planes, registra tu progreso y habla con tu entrenador.

----------------------------
❗ *IMPORTANTE:* El enlace es válido *7 días*. Si caduca, avísame y te envío uno nuevo.
----------------------------

¡Mucho ánimo y bienvenido al equipo! ⭐
— *APD SPORT*`;
}

function buildEmailBody(name: string, link: string): string {
  const greeting = name ? ` ${name}` : '';
  // Short version for mailto: (must fit ~2000 char URL limit)
  return `Hola${greeting} 👋

Aqui tienes tu enlace de registro en APD SPORT (5-10 min):

${link}

Que ocurre despues:
1. Rellena tu ficha de salud y objetivos
2. Recibes el contrato en tu correo automaticamente
3. Tu entrenador activa tu cuenta
4. Recibes tu plan personalizado de nutricion y/o entrenamiento

El enlace es valido 7 dias.

APD SPORT
${SENDER_EMAIL} | ${SENDER_WHATSAPP}`;
}

function buildEmailBodyFull(name: string, link: string): string {
  const greeting = name ? ` ${name}` : '';
  return `APD SPORT — ¡BIENVENIDO AL EQUIPO!

Hola${greeting} 👋

Nos alegramos de tenerte aquí. Estamos preparados para diseñar
tu plan personalizado de nutrición y/o entrenamiento.

Para empezar, completa tu ficha de salud (solo 5-10 minutos):

TU ENLACE DE REGISTRO:
${link}

------------------------------------------
¿QUÉ OCURRE DESPUÉS?
------------------------------------------

  1. RELLENA TU FICHA ✏️
     Accede al enlace y completa el formulario con tus datos
     de salud, hábitos y objetivos.

  2. RECIBE EL CONTRATO 📋
     Al finalizar, te enviamos automáticamente el contrato de
     prestación de servicios a este correo. Guárdalo.

  3. ACTIVACIÓN DE CUENTA 🔑
     Tu entrenador revisará tu ficha y activará tu acceso
     a la plataforma. Te avisaremos cuando esté listo.

  4. TU PLAN PERSONALIZADO 💪
     Recibirás tu plan de nutrición y/o entrenamiento diseñado
     específicamente para tus objetivos.

  5. SEGUIMIENTO CONTINUO 📊
     Desde la app: consulta tus planes, registra tu progreso
     y habla directamente con tu entrenador.

------------------------------------------
❗ IMPORTANTE
------------------------------------------

  El enlace de registro es válido durante 7 días.
  Si caduca, escríbenos y te enviamos uno nuevo de inmediato.

------------------------------------------
¿TIENES ALGUNA DUDA?
------------------------------------------

  ${SENDER_EMAIL}
  ${SENDER_WHATSAPP}

APD SPORT — Nutrición & Entrenamiento Personalizado`;
}

export const PatientInviteModal: React.FC<Props> = ({ onClose }) => {
  const { createPatientInvite } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'form' | 'link'>('form');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailMsgCopied, setEmailMsgCopied] = useState(false);
  const [sentMethods, setSentMethods] = useState<Set<string>>(new Set());

  const handleCreate = () => {
    if (!phone.trim() && !email.trim()) return;
    const pending = createPatientInvite(name.trim(), email.trim(), phone.trim());
    const baseUrl = window.location.href.split('#')[0];
    // Encode full pending data into the URL so the link works on any device
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(pending))));
    const registrationLink = `${baseUrl}#/registro-paciente/${encoded}`;
    setLink(registrationLink);
    setStep('link');
  };

  const handleWhatsApp = () => {
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    const message = buildWhatsAppMessage(name, link);
    const targetPhone = cleanPhone || phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    setSentMethods(prev => new Set(prev).add('whatsapp'));
  };

  const handleEmail = () => {
    const subject = encodeURIComponent('Bienvenido/a a APD SPORT — Tu enlace de registro personalizado');
    const body = encodeURIComponent(buildEmailBody(name, link));
    const to = email ? email : '';
    const mailto = `mailto:${to}?subject=${subject}&body=${body}`;
    window.open(mailto);
    setSentMethods(prev => new Set(prev).add('email'));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEmail = async () => {
    const subject = 'Bienvenido/a a APD SPORT — Tu enlace de registro personalizado';
    const body = buildEmailBodyFull(name, link);
    await navigator.clipboard.writeText(`Asunto: ${subject}\n\n${body}`);
    setEmailMsgCopied(true);
    setTimeout(() => setEmailMsgCopied(false), 3000);
  };

  const handleReset = () => {
    setStep('form');
    setName('');
    setEmail('');
    setPhone('');
    setLink('');
    setSentMethods(new Set());
    setCopied(false);
    setEmailMsgCopied(false);
  };

  const canCreate = phone.trim() || email.trim();
  const waSent = sentMethods.has('whatsapp');
  const emailSent = sentMethods.has('email');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <Send className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Invitar Paciente</h2>
              <p className="text-xs text-slate-400">Envía el enlace de registro con instrucciones</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {step === 'form' && (
            <div className="space-y-4">
              {/* Fields */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />Nombre del paciente
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre y apellidos (opcional)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />Número de WhatsApp del paciente
                </label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <p className="text-xs text-slate-400 mt-1">Incluye prefijo país. Ej: +34 para España</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />Email del paciente
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>

              {/* Sender info */}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div className="flex items-start gap-2.5 p-3">
                  <div className="w-7 h-7 bg-[#25D366]/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageCircle className="w-4 h-4 text-[#25D366]" />
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-slate-700">Envío por WhatsApp</p>
                    <p className="text-slate-500 mt-0.5">Envía desde el número de empresa: <strong className="text-slate-700">{SENDER_WHATSAPP}</strong></p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-3">
                  <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-slate-700">Envío por Email</p>
                    <p className="text-slate-500 mt-0.5">Envía desde la cuenta: <strong className="text-slate-700">{SENDER_EMAIL}</strong></p>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold flex items-center gap-1"><Info className="w-3.5 h-3.5" />¿Cómo funciona?</p>
                <p>1. Se genera un enlace único y seguro (válido 7 días)</p>
                <p>2. El mensaje incluye instrucciones paso a paso para el paciente</p>
                <p>3. El paciente rellena su ficha completa y acepta el contrato</p>
                <p>4. El contrato se envía automáticamente a su correo</p>
                <p>5. Su cuenta queda vinculada a ti automáticamente</p>
              </div>

              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Generar Enlace con Instrucciones
              </button>
            </div>
          )}

          {step === 'link' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm text-green-700 font-medium">Enlace generado correctamente</p>
                  <p className="text-xs text-green-600">El mensaje incluye instrucciones completas de bienvenida</p>
                </div>
              </div>

              {/* Link field */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Enlace de registro</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={link}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-600 focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Send options */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Enviar al paciente</p>

                {/* WhatsApp */}
                {phone ? (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                      <span className="text-xs text-slate-500">Enviar desde WhatsApp</span>
                      <span className="ml-auto text-xs font-semibold text-slate-700">{SENDER_WHATSAPP}</span>
                    </div>
                    <button
                      onClick={handleWhatsApp}
                      className={`w-full flex items-center justify-center gap-2.5 py-3.5 font-semibold text-sm transition ${waSent ? 'bg-green-700 text-white' : 'bg-[#25D366] text-white hover:bg-[#1da851]'}`}
                    >
                      <MessageCircle className="w-5 h-5" />
                      {waSent ? '✓ Enviado por WhatsApp' : `Enviar por WhatsApp${name ? ` a ${name}` : ''}`}
                    </button>
                    {!waSent && (
                      <p className="text-xs text-center text-slate-400 py-2 px-3">
                        Asegúrate de abrir WhatsApp con la cuenta <strong>{SENDER_WHATSAPP}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                    <MessageCircle className="w-4 h-4 mx-auto mb-1 opacity-40" />
                    Añade un número de WhatsApp para enviar por este canal
                  </div>
                )}

                {/* Email */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <Mail className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs text-slate-500">Enviar desde Email</span>
                    <span className="ml-auto text-xs font-semibold text-slate-700">{SENDER_EMAIL}</span>
                  </div>
                  <button
                    onClick={handleEmail}
                    className={`w-full flex items-center justify-center gap-2.5 py-3.5 font-semibold text-sm transition ${emailSent ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    <Mail className="w-5 h-5" />
                    {emailSent ? '✓ Abierto en cliente de correo' : `Abrir email${email ? ` a ${email}` : ''}`}
                  </button>
                  <button
                    onClick={handleCopyEmail}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition border-t border-slate-100 ${emailMsgCopied ? 'bg-green-50 text-green-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {emailMsgCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {emailMsgCopied ? '¡Mensaje copiado! Pégalo en tu correo' : 'Copiar mensaje completo'}
                  </button>
                  <p className="text-xs text-center text-slate-400 py-2 px-3 bg-slate-50 border-t border-slate-100">
                    Envía desde <strong>{SENDER_EMAIL}</strong>
                  </p>
                </div>
              </div>

              {/* Preview of WhatsApp message */}
              <details className="rounded-xl border border-slate-200">
                <summary className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-50 rounded-xl">
                  <Info className="w-3.5 h-3.5" />
                  Ver previsualización del mensaje
                </summary>
                <div className="px-3 pb-3">
                  <pre className="text-xs text-slate-500 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto">
                    {buildWhatsAppMessage(name || 'Paciente', link || 'https://tuenlace.com/...')}
                  </pre>
                </div>
              </details>

              <button
                onClick={handleReset}
                className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition"
              >
                Invitar otro paciente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
