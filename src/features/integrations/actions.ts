import { installPackageFor, type IntegrationCapability } from "./install";

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
    zoom: "zoom",
    teams: "teams",
    turnitin: "turnitin",
    sige: "sige",
    agt: "agt",
  };
  const prefix = capabilityId.split(".")[0] ?? capabilityId;
  return aliases[prefix] ?? prefix;
}

export function officialUrlForCapability(capabilityId: string) {
  return installPackageFor(providerIdFromCapability(capabilityId))?.installUrl ?? "";
}

export function paymentReference(prefix: "EMIS" | "UML") {
  const body = String(Math.floor(100_000_000 + Math.random() * 900_000_000));
  return `${prefix}${body}`;
}

export function whatsappHref(phoneOrEmpty: string, text?: string) {
  const digits = phoneOrEmpty.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return digits ? `https://wa.me/${digits}${query}` : `https://wa.me/${query}`;
}

export function meetingRoomLink(kind: "zoom" | "teams") {
  if (kind === "zoom") {
    return `https://zoom.us/j/${Math.floor(10_000_000_000 + Math.random() * 89_999_999_999)}`;
  }
  return `https://teams.microsoft.com/l/meetup-join/siga-${Date.now()}`;
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function actionForCapability(capability: Pick<IntegrationCapability, "id">) {
  return capabilityActionKind[capability.id] ?? "open-official";
}
