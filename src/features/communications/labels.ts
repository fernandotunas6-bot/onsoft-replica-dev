import type { StatusKey } from "@/lib/status-registry";
import type { announcementAudienceOptions, announcementChannelOptions } from "./schemas";

/**
 * Nomes dos públicos, canais e estados dos comunicados, partilhados pela lista
 * (`/comunicacoes`) e pela página de cada comunicado.
 */

type Audience = (typeof announcementAudienceOptions)[number];
type Channel = (typeof announcementChannelOptions)[number];

export const canalLabel: Record<Channel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "E-mail",
  portal: "Portal",
};

export const estadoLabel: Record<string, string> = {
  sent: "Enviado",
  scheduled: "Agendado",
  draft: "Rascunho",
  cancelled: "Arquivado",
};

export const audienceLabel: Record<Audience, string> = {
  all_guardians: "Todos os encarregados",
  guardians_with_debt: "Encarregados com dívida",
  students_secondary: "Alunos do ensino secundário",
  students_finalists: "Alunos finalistas",
  teaching_staff: "Corpo docente",
  alumni_all: "Alumni (todos com consentimento)",
  alumni_opportunities: "Alumni (oportunidades & carreiras)",
  alumni_events: "Alumni (eventos & encontros)",
  alumni_mentoring: "Alumni (mentoria)",
  alumni_surveys: "Alumni (pesquisas e tracer studies)",
  alumni_fundraising: "Alumni (campanhas & bolsas)",
};

/** A cor do estado no `StatusBadge`. */
export function announcementStatusKey(status: string): StatusKey {
  if (status === "sent") return "paid";
  if (status === "scheduled") return "pending";
  if (status === "cancelled") return "cancelled";
  return "inactive";
}

export function audienceName(audience: string): string {
  return (audienceLabel as Record<string, string>)[audience] ?? audience;
}

export function channelName(channel: string): string {
  return (canalLabel as Record<string, string>)[channel] ?? channel;
}
