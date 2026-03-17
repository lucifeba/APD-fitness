import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, MessageCircle, Copy, CheckCircle2, User, Mail, Phone, Info } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const SENDER_WHATSAPP = '+34676002647';

export const PatientInviteModal: React.FC<Props> = ({ onClose }) => {
  const { createPatientInvite } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'form' | 'link'>('form');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendMethod, setSendMethod] = useState<'whatsapp' | 'email' | null>(null);

  const handleCreate = () => {
    if (!phone.trim() && !email.trim()) return;
    const pending = createPatientInvite(name.trim(), email.trim(), phone.trim());
    const baseUrl = window.location.href.split('#')[0];
    const registrationLink = `${baseUrl}#/registro-paciente/${pending.token}`;
    setLink(registrationLink);
    setStep('link');
  };

  const handleWhatsApp = () => {
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    const message = `Hola${name ? ` ${name}` : ''},\n\nTe envío este enlace para completar tu ficha nutricional y de salud. Solo te llevará unos minutos y me permitirá preparar tu plan personalizado.\n\n${link}\n\nEl enlace es válido durante 7 días.\n\n¡Cualquier duda, escríbeme! 💪\n\n— APD SPORT (${SENDER_WHATSAPP})`;
    const targetPhone = cleanPhone || phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    setSendMethod('whatsapp');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent('Completa tu ficha de salud — APD SPORT');
    const body = encodeURIComponent(
      `Hola${name ? ` ${name}` : ''},\n\nTe envío este enlace para completar tu ficha de salud y nutrición. Solo te llevará unos minutos y me permitirá preparar tu plan personalizado.\n\n${link}\n\nEl enlace es válido durante 7 días.\n\nUna vez completada, recibirás un correo de confirmación con tu contrato de prestación de servicios.\n\n¡Cualquier duda, escríbeme!\n\n— APD SPORT\ninfo@apdsport.com`
    );
    const mailto = email ? `mailto:${email}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
    window.open(mailto);
    setSendMethod('email');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canCreate = phone.trim() || email.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Invitar Paciente</h2>
              <p className="text-xs text-slate-400">Envía el enlace de registro</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {step === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1"><User className="w-3.5 h-3.5" />Nombre del paciente</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre y apellidos (opcional)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />Número de WhatsApp
                </label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+34 600 000 000" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                <p className="text-xs text-slate-400 mt-1">Incluye prefijo país. Ej: +34 para España</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>

              {/* WhatsApp sender info */}
              {phone.trim() && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-2.5">
                  <Info className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-green-700">
                    <p className="font-semibold mb-0.5">Envío por WhatsApp</p>
                    <p>Se abrirá WhatsApp con el mensaje pre-escrito. Envíalo desde el número <strong>{SENDER_WHATSAPP}</strong> al paciente.</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">¿Cómo funciona?</p>
                <p>1. Se genera un enlace único y seguro (válido 7 días)</p>
                <p>2. Lo envías por WhatsApp o Email con un clic</p>
                <p>3. El paciente rellena su ficha completa y acepta el contrato</p>
                <p>4. El contrato se envía automáticamente a su correo</p>
                <p>5. Su cuenta queda vinculada a ti automáticamente</p>
              </div>
              <button onClick={handleCreate} disabled={!canCreate} className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 disabled:opacity-40 transition">
                Generar Enlace
              </button>
            </div>
          )}

          {step === 'link' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700 font-medium">Enlace generado correctamente</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Enlace de registro</label>
                <div className="flex gap-2">
                  <input readOnly value={link} className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 text-slate-600 focus:outline-none" />
                  <button onClick={handleCopy} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Send via WhatsApp */}
              {phone && (
                <button onClick={handleWhatsApp} className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition shadow-md ${sendMethod === 'whatsapp' ? 'bg-green-700 text-white' : 'bg-[#25D366] text-white hover:bg-[#1da851]'}`}>
                  <MessageCircle className="w-5 h-5" />
                  {sendMethod === 'whatsapp' ? '✓ Enviado por WhatsApp' : `Enviar por WhatsApp${name ? ` a ${name}` : ''}`}
                </button>
              )}

              {/* Send via Email */}
              <button
                onClick={handleEmail}
                className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition shadow-md ${sendMethod === 'email' ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                <Mail className="w-5 h-5" />
                {sendMethod === 'email' ? '✓ Enviado por Email' : `Enviar por Email${email ? ` a ${email}` : ''}`}
              </button>

              {phone && (
                <p className="text-xs text-center text-slate-400">
                  Recuerda enviar el WhatsApp desde <strong>{SENDER_WHATSAPP}</strong>
                </p>
              )}

              <button onClick={() => { setStep('form'); setName(''); setEmail(''); setPhone(''); setLink(''); setSendMethod(null); }} className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition">
                Invitar otro paciente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
