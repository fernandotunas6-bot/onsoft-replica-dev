export const academicIntegrationCatalog = [
  {
    id: "multicaixa_express",
    name: "Multicaixa Express",
    group: "Pagamentos",
    description: "Referências e confirmação de pagamentos EMIS / Multicaixa Express.",
  },
  {
    id: "unitel_money",
    name: "Unitel Money",
    group: "Pagamentos",
    description: "Carteira móvel Unitel Money para mensalidades e propinas.",
  },
  {
    id: "whatsapp_business",
    name: "WhatsApp Business",
    group: "Comunicação",
    description: "API oficial para salas de turma e avisos a encarregados.",
  },
  {
    id: "resend_email",
    name: "Email / Resend",
    group: "Comunicação",
    description: "Envio transaccional de recibos, avisos e convites.",
  },
  {
    id: "gmail_workspace",
    name: "Google Gmail Workspace",
    group: "Comunicação",
    description: "Envio automático de e-mails de boas-vindas e credenciais via Gmail API.",
  },
  {
    id: "google_classroom",
    name: "Google Classroom",
    group: "Académico",
    description: "Turmas, trabalhos e materiais no Classroom.",
  },
  {
    id: "moodle",
    name: "Moodle",
    group: "Académico",
    description: "LMS Moodle para disciplinas e avaliações.",
  },
  {
    id: "canvas",
    name: "Canvas LMS",
    group: "Académico",
    description: "Instructure Canvas para ensino híbrido.",
  },
  {
    id: "microsoft_365_education",
    name: "Microsoft 365 Education",
    group: "Académico",
    description: "Teams, Outlook e OneDrive da escola.",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    group: "Calendário",
    description: "Sincronização do calendário lectivo e turmas com o Google Calendar.",
  },
  {
    id: "apple_calendar",
    name: "Apple Calendar / ICS",
    group: "Calendário",
    description: "Feed ICS para iPhone, iPad e calendário nativo.",
  },
  {
    id: "firebase_analytics",
    name: "Firebase & Crashlytics",
    group: "Monitorização",
    description: "Monitorização de exceções, telemetria de app e analítica híbrida.",
  },
  {
    id: "zoom",
    name: "Zoom",
    group: "Aulas",
    description: "Salas virtuais para aulas síncronas.",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    group: "Aulas",
    description: "Reuniões e turmas no Teams.",
  },
  {
    id: "turnitin",
    name: "Turnitin",
    group: "Académico",
    description: "Originalidade e feedback de trabalhos.",
  },
  {
    id: "sige",
    name: "SIGE",
    group: "Estado",
    description: "Intercâmbio com sistemas de gestão educativa nacionais.",
  },
  {
    id: "agt",
    name: "AGT",
    group: "Estado",
    description: "Administração Geral Tributária: NIF, faturação electrónica e obrigações fiscais.",
  },
] as const;

export type CatalogIntegrationId = (typeof academicIntegrationCatalog)[number]["id"];

export const catalogGroupOrder = [
  "Pagamentos",
  "Comunicação",
  "Académico",
  "Aulas",
  "Calendário",
  "Monitorização",
  "Estado",
] as const;

export function groupCatalogItems<T extends { group: string }>(items: readonly T[]) {
  return catalogGroupOrder
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}

export const integrationFieldHints: Record<
  CatalogIntegrationId,
  { merchant: string; callback: string }
> = {
  multicaixa_express: {
    merchant: "Merchant EMIS / Multicaixa",
    callback: "URL de confirmação",
  },
  unitel_money: {
    merchant: "Merchant Unitel Money",
    callback: "URL de callback",
  },
  whatsapp_business: {
    merchant: "Phone Number ID (Cloud API)",
    callback: "Access Token (permanente)",
  },
  resend_email: {
    merchant: "API key Resend",
    callback: "Domínio de envio",
  },
  gmail_workspace: {
    merchant: "Client ID OAuth Google",
    callback: "https://siga.escola.ao/configuracoes",
  },
  google_classroom: {
    merchant: "Client ID Google",
    callback: "Redirect URI",
  },
  moodle: {
    merchant: "Token de serviço",
    callback: "URL do Moodle",
  },
  canvas: {
    merchant: "Access token Canvas",
    callback: "URL da instância",
  },
  microsoft_365_education: {
    merchant: "Tenant / Client ID",
    callback: "Redirect URI",
  },
  google_calendar: {
    merchant: "Conta Google da escola",
    callback: "URL do feed ICS",
  },
  apple_calendar: {
    merchant: "Nome do calendário",
    callback: "URL do feed ICS",
  },
  firebase_analytics: {
    merchant: "Firebase Project ID",
    callback: "App ID / Measurement ID",
  },
  zoom: {
    merchant: "Account / Client ID",
    callback: "Redirect URI",
  },
  teams: {
    merchant: "Tenant / Client ID",
    callback: "Redirect URI",
  },
  turnitin: {
    merchant: "Account ID",
    callback: "API URL",
  },
  sige: {
    merchant: "Código da escola no SIGE",
    callback: "Endpoint de intercâmbio",
  },
  agt: {
    merchant: "NIF da escola",
    callback: "Portal do contribuinte / software certificado",
  },
};

export function isCatalogIntegrationId(value: string): value is CatalogIntegrationId {
  return academicIntegrationCatalog.some((item) => item.id === value);
}
