import { academicIntegrationCatalog, type CatalogIntegrationId } from "./catalog";
import { integrationInstallPackages, type IntegrationCapability } from "./install";

export type CapabilityActionKind =
  | "ics-google"
  | "ics-apple"
  | "copy-payment-ref"
  | "copy-unitel-ref"
  | "copy-nif"
  | "copy-einvoice"
  | "copy-meeting-zoom"
  | "copy-meeting-teams"
  | "open-official"
  | "open-whatsapp"
  | "navigate-notas"
  | "navigate-horarios"
  | "navigate-comunicacoes"
  | "navigate-arquivos"
  | "export-sige-students"
  | "export-sige-classes";

export const capabilityActionKind: Record<string, CapabilityActionKind> = {
  "multicaixa.references": "copy-payment-ref",
  "multicaixa.confirm": "copy-payment-ref",
  "unitel.wallet": "copy-unitel-ref",
  "unitel.receipts": "copy-unitel-ref",
  "whatsapp.class_groups": "open-whatsapp",
  "whatsapp.notices": "navigate-comunicacoes",
  "classroom.classes": "open-official",
  "classroom.work": "open-official",
  "moodle.courses": "open-official",
  "moodle.grades": "navigate-notas",
  "canvas.courses": "open-official",
  "canvas.assignments": "navigate-notas",
  "m365.outlook": "navigate-comunicacoes",
  "m365.onedrive": "navigate-arquivos",
  "gcal.subscribe": "ics-google",
  "apple.ics": "ics-apple",
  "resend.send": "navigate-comunicacoes",
  "resend.invoices": "copy-einvoice",
  "resend.documents": "open-official",
  "gmail.welcome": "navigate-comunicacoes",
  "gmail.credentials": "open-official",
  "firebase.crashlytics": "navigate-notas",
  "firebase.telemetry": "navigate-comunicacoes",
  "zoom.rooms": "copy-meeting-zoom",
  "zoom.notices": "navigate-comunicacoes",
  "teams.meetings": "copy-meeting-teams",
  "teams.classes": "open-official",
  "turnitin.originality": "navigate-notas",
  "sige.export_classes": "export-sige-classes",
  "sige.export_students": "export-sige-students",
  "agt.nif": "copy-nif",
  "agt.einvoice": "copy-einvoice",
};

export function actionForCapability(cap?: { id?: string }): CapabilityActionKind {
  const id = cap?.id ?? "";
  return capabilityActionKind[id] ?? "open-official";
}

export function providerIdFromCapability(capabilityId: string) {
  const aliases: Record<string, string> = {
    multicaixa: "multicaixa_express",
    unitel: "unitel_money",
    whatsapp: "whatsapp_business",
    classroom: "google_classroom",
    moodle: "moodle",
    canvas: "canvas",
    m365: "microsoft_365_education",
    gcal: "google_calendar",
    apple: "apple_calendar",
    resend: "resend_email",
    gmail: "gmail_workspace",
    firebase: "firebase_analytics",
    zoom: "zoom",
    teams: "teams",
    turnitin: "turnitin",
    sige: "sige",
    agt: "agt",
  };
  const prefix = capabilityId.split(".")[0] ?? capabilityId;
  return aliases[prefix] ?? prefix;
}

export function officialUrlForCapability(capabilityId: string): string {
  const provider = providerIdFromCapability(capabilityId) as CatalogIntegrationId;
  const pack = integrationInstallPackages[provider];
  return pack?.installUrl || pack?.docsUrl || "https://siga.escola.ao/";
}

export function paymentReference(kind: "EMIS" | "UML") {
  const stamp = Date.now().toString().slice(-9);
  return `${kind}${stamp}`;
}

export function meetingRoomLink(provider: "zoom" | "teams") {
  if (provider === "zoom") return "https://zoom.us/j/90011122233";
  return "https://teams.microsoft.com/l/meetup-join/siga-aula-virtual";
}

export function whatsappHref(phoneRaw: string, message?: string) {
  const digits = phoneRaw.replace(/\D/g, "");
  if (!digits) return "https://wa.me/";
  if (!message) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function classroomCourseHref(codeOrUrl?: string): string {
  if (!codeOrUrl) return "https://classroom.google.com/";
  if (codeOrUrl.startsWith("https://")) return codeOrUrl;
  return `https://classroom.google.com/c/${encodeURIComponent(codeOrUrl)}`;
}

export function actionLabelForCapability(cap: IntegrationCapability): string {
  const kind = capabilityActionKind[cap.id];
  switch (kind) {
    case "copy-payment-ref":
      return "Copiar ref. Multicaixa";
    case "copy-unitel-ref":
      return "Copiar ref. Unitel";
    case "open-whatsapp":
      return "Abrir grupo WhatsApp";
    case "navigate-comunicacoes":
      return "Enviar em Comunicados";
    case "navigate-notas":
      return "Ver na pauta";
    case "navigate-horarios":
      return "Ver nos horários";
    case "navigate-arquivos":
      return "Abrir Biblioteca";
    case "ics-google":
      return "Subscrever Google";
    case "ics-apple":
      return "Descarregar ICS";
    case "copy-einvoice":
      return "Copiar fatura AGT";
    case "copy-nif":
      return "Copiar NIF";
    case "copy-meeting-zoom":
      return "Copiar link Zoom";
    case "copy-meeting-teams":
      return "Copiar link Teams";
    case "export-sige-classes":
      return "Exportar turmas SIGE";
    case "export-sige-students":
      return "Exportar alunos SIGE";
    case "open-official":
    default:
      return `Abrir ${cap.label}`;
  }
}
