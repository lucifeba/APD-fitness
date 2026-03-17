import emailjs from '@emailjs/browser';

// ── EmailJS Configuration ────────────────────────────────────────────────────
// To activate email sending:
// 1. Create account at https://www.emailjs.com
// 2. Add your email service (use info@apdsport.com / Pavicornio.8460 via SMTP)
// 3. Create an email template and copy the IDs below
// 4. Replace the placeholder values with your real IDs

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_apdsport';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'apdsport_public_key';
const EMAILJS_CONTRACT_TEMPLATE = import.meta.env.VITE_EMAILJS_CONTRACT_TEMPLATE || 'template_contract';
const FROM_EMAIL = 'info@apdsport.com';
const FROM_NAME = 'APD SPORT';

let initialized = false;

function initEmailJS() {
  if (!initialized) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    initialized = true;
  }
}

export interface ContractEmailParams {
  to_email: string;
  to_name: string;
  trainer_name?: string;
  accepted_at: string;
  contract_html: string;
}

export async function sendContractEmail(params: ContractEmailParams): Promise<boolean> {
  try {
    initEmailJS();
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_CONTRACT_TEMPLATE, {
      from_name: FROM_NAME,
      from_email: FROM_EMAIL,
      to_email: params.to_email,
      to_name: params.to_name,
      trainer_name: params.trainer_name || 'APD SPORT',
      accepted_at: params.accepted_at,
      contract_html: params.contract_html,
      reply_to: FROM_EMAIL,
    });
    return true;
  } catch (error) {
    console.error('EmailJS send error:', error);
    return false;
  }
}

export function generateContractText(athleteName: string, trainerName: string, acceptedAt: string): string {
  return `
CONTRATO DE PRESTACIÓN DE SERVICIOS NUTRICIONALES Y DEPORTIVOS
APD SPORT — ${FROM_EMAIL}

Fecha de aceptación: ${acceptedAt}

PARTES:
- PRESTADOR: APD SPORT (info@apdsport.com)
- CLIENTE: ${athleteName}
- PROFESIONAL ASIGNADO: ${trainerName}

1. OBJETO DEL CONTRATO
APD SPORT se compromete a prestar servicios de nutrición deportiva y planificación de entrenamiento personalizado al cliente, en base a los datos aportados en la ficha de anamnesis inicial.

2. SERVICIOS INCLUIDOS
• Elaboración de plan nutricional personalizado adaptado a los objetivos del deportista.
• Elaboración y seguimiento de planes de entrenamiento.
• Acceso a la plataforma digital APD SPORT para consulta de planes y comunicación con el profesional.
• Revisiones periódicas y ajustes del plan según evolución.
• Chat directo con el/la nutricionista/entrenador/a asignado/a.

3. OBLIGACIONES DEL CLIENTE
• Proporcionar datos verídicos en la ficha de salud y nutrición.
• Consultar con su médico antes de iniciar cualquier programa si padece condiciones de salud.
• Informar al profesional de cualquier cambio relevante en su estado de salud.
• Respetar las indicaciones del profesional para lograr los objetivos pactados.

4. PROTECCIÓN DE DATOS (RGPD)
De conformidad con el Reglamento General de Protección de Datos (UE) 2016/679, APD SPORT informa que los datos personales facilitados serán tratados con la finalidad de prestar los servicios contratados. Los datos no serán cedidos a terceros salvo obligación legal. El cliente puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad contactando en info@apdsport.com.

5. CONFIDENCIALIDAD
APD SPORT se compromete a mantener la confidencialidad de toda la información médica y personal del cliente, no divulgándola sin su consentimiento expreso.

6. VIGENCIA
El contrato estará vigente desde la fecha de aceptación hasta que cualquiera de las partes lo rescinda con un preaviso de 7 días.

El cliente declara haber leído, comprendido y aceptado íntegramente las condiciones del presente contrato.

Firmado digitalmente por: ${athleteName}
Fecha y hora: ${acceptedAt}
IP registrada en: APD SPORT Platform
`;
}
