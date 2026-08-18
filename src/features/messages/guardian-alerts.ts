import { whatsappHref } from "@/features/integrations/actions";
import { kwanza } from "@/lib/currency";

export type GuardianContact = {
  guardianName: string;
  guardianPhone?: string;
  guardianEmail?: string;
  studentName: string;
  registrationNumber: string;
  className?: string;
};

export type TuitionAlertInput = GuardianContact & {
  monthName: string;
  amount: number;
  dueDate: string;
  iban?: string;
  schoolName: string;
};

export type GradeAlertInput = GuardianContact & {
  termName: string;
  subjectName: string;
  mac?: number;
  npp?: number;
  npt?: number;
  average: number;
  schoolName: string;
};

export type AttendanceAlertInput = GuardianContact & {
  absenceDate: string;
  subjectName?: string;
  schoolName: string;
};

/**
 * Gera mensagem formatada para aviso de propinas e link WhatsApp.
 */
export function buildGuardianTuitionAlert(input: TuitionAlertInput) {
  const amountFormatted = kwanza(input.amount);
  const text = `Estimado(a) Encarregado(a) ${input.guardianName},\n\n` +
    `Lembramos que a propina referente a ${input.monthName} do(a) estudante ${input.studentName} (${input.registrationNumber}${input.className ? `, Turma ${input.className}` : ""}) tem o valor de ${amountFormatted} com vencimento a ${input.dueDate}.\n` +
    (input.iban ? `\nIBAN para pagamento: ${input.iban}\n` : "") +
    `Por favor, envie o comprovativo para a secretaria da escola.\n\n` +
    `Atenciosamente,\n${input.schoolName}`;

  const whatsappUrl = input.guardianPhone ? whatsappHref(input.guardianPhone, text) : null;

  return {
    text,
    whatsappUrl,
    emailSubject: `Aviso de Propina (${input.monthName}) - ${input.studentName}`,
  };
}

/**
 * Gera mensagem formatada para publicação de notas do trimestre.
 */
export function buildGuardianGradeAlert(input: GradeAlertInput) {
  const macStr = input.mac != null ? input.mac.toFixed(1) : "—";
  const nppStr = input.npp != null ? input.npp.toFixed(1) : "—";
  const nptStr = input.npt != null ? input.npt.toFixed(1) : "—";
  const averageStr = input.average.toFixed(1);
  const statusLabel = input.average >= 10 ? "Aproveitamento Positivo" : "Necessita de Recuperação";

  const text = `Estimado(a) Encarregado(a) ${input.guardianName},\n\n` +
    `Informamos as notas de ${input.subjectName} do(a) estudante ${input.studentName} no ${input.termName}:\n` +
    `• MAC (Contínua): ${macStr}\n` +
    `• NPP (Professor): ${nppStr}\n` +
    `• NPT (Trimestral): ${nptStr}\n` +
    `• Média Trimestral: ${averageStr} (${statusLabel})\n\n` +
    `Consulte o boletim completo no portal SIGA ou contacte a direção pedagógica.\n\n` +
    `Atenciosamente,\n${input.schoolName}`;

  const whatsappUrl = input.guardianPhone ? whatsappHref(input.guardianPhone, text) : null;

  return {
    text,
    whatsappUrl,
    emailSubject: `Notas do ${input.termName}: ${input.subjectName} - ${input.studentName}`,
  };
}

/**
 * Gera mensagem formatada para falta injustificada.
 */
export function buildGuardianAttendanceAlert(input: AttendanceAlertInput) {
  const text = `Estimado(a) Encarregado(a) ${input.guardianName},\n\n` +
    `Informamos que o(a) estudante ${input.studentName} registou uma falta injustificada no dia ${input.absenceDate}${input.subjectName ? ` na aula de ${input.subjectName}` : ""}.\n\n` +
    `Pedimos a gentileza de justificar a ausência junto da secretaria escolar.\n\n` +
    `Atenciosamente,\n${input.schoolName}`;

  const whatsappUrl = input.guardianPhone ? whatsappHref(input.guardianPhone, text) : null;

  return {
    text,
    whatsappUrl,
    emailSubject: `Aviso de Falta Escolar - ${input.studentName}`,
  };
}
