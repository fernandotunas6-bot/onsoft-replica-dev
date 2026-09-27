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
  "gcal.subscribe": "ics-google",
  "apple.ics": "ics-apple",
  "resend.send": "navigate-comunicacoes",
  "resend.invoices": "copy-einvoice",
  "resend.documents": "open-official",
  "zoom.rooms": "copy-meeting-zoom",
  "zoom.notices": "navigate-comunicacoes",
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
    gcal: "google_calendar",
    apple: "apple_calendar",
    resend: "resend_email",
    zoom: "zoom",
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

/** Sala de recurso quando o OAuth do Zoom nao devolve uma reuniao real. */
export function meetingRoomLink() {
  return "https://zoom.us/j/90011122233";
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
    case "export-sige-classes":
      return "Exportar turmas SIGE";
    case "export-sige-students":
      return "Exportar alunos SIGE";
    case "open-official":
    default:
      return `Abrir ${cap.label}`;
  }
}
