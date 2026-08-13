import { canAccessPath, type ModuleGrantMap } from "@/features/auth/access-policy";
import { academicIntegrationCatalog } from "./catalog";

export type LauncherSectionId =
  | "workspace"
  | "integrations"
  | "payments"
  | "communication"
  | "academic"
  | "calendar"
  | "lessons"
  | "state";

export type LauncherTarget =
  | { type: "route"; to: string; search?: Record<string, string> }
  | { type: "settings"; panelId: string }
  | { type: "ics" };

export type IntegrationStatus = "disconnected" | "configured" | "connected" | "error";

export type LauncherApp = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  section: LauncherSectionId;
  mark: string;
  target: LauncherTarget;
  catalogId?: string;
};

const integrationTargets: Record<
  (typeof academicIntegrationCatalog)[number]["id"],
  LauncherTarget
> = {
  multicaixa_express: { type: "route", to: "/financeiro" },
  unitel_money: { type: "route", to: "/financeiro" },
  whatsapp_business: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
  google_classroom: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
  moodle: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
  canvas: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
  microsoft_365_education: { type: "route", to: "/arquivos" },
  google_calendar: { type: "ics" },
  apple_calendar: { type: "ics" },
  resend_email: { type: "route", to: "/comunicacoes" },
  zoom: { type: "route", to: "/pedagogica", search: { tab: "horarios" } },
  teams: { type: "route", to: "/pedagogica", search: { tab: "horarios" } },
  turnitin: { type: "route", to: "/pedagogica", search: { tab: "notas" } },
  sige: { type: "settings", panelId: "integracoes" },
  agt: { type: "route", to: "/faturas" },
};

const integrationShortNames: Partial<
  Record<(typeof academicIntegrationCatalog)[number]["id"], string>
> = {
  multicaixa_express: "Multicaixa",
  unitel_money: "Unitel Money",
  whatsapp_business: "WhatsApp",
  google_classroom: "Classroom",
  microsoft_365_education: "Microsoft 365",
  google_calendar: "Google Calendar",
  apple_calendar: "Calendário Apple",
  resend_email: "Email",
  agt: "AGT",
};

const catalogGroupToSection: Record<string, LauncherSectionId> = {
  Pagamentos: "payments",
  Comunicação: "communication",
  Académico: "academic",
  Calendário: "calendar",
  Aulas: "lessons",
  Estado: "state",
};

export const launcherWorkspaceApps: LauncherApp[] = [
  {
    id: "siga-dashboard",
    name: "Início",
    shortName: "Início",
    description: "Painel e atalhos do dia.",
    section: "workspace",
    mark: "siga-dashboard",
    target: { type: "route", to: "/" },
  },
  {
    id: "siga-alunos",
    name: "Alunos",
    shortName: "Alunos",
    description: "Fichas, matrícula e estado.",
    section: "workspace",
    mark: "siga-alunos",
    target: { type: "route", to: "/alunos" },
  },
  {
    id: "siga-pedagogica",
    name: "Pedagógica",
    shortName: "Pedagógica",
    description: "Turmas, notas e horários.",
    section: "workspace",
    mark: "siga-pedagogica",
    target: { type: "route", to: "/pedagogica" },
  },
  {
    id: "siga-calendario",
    name: "Calendário",
    shortName: "Calendário",
    description: "Períodos lectivos e ICS.",
    section: "workspace",
    mark: "siga-calendario",
    target: { type: "route", to: "/calendario" },
  },
  {
    id: "siga-financeiro",
    name: "Tesouraria",
    shortName: "Tesouraria",
    description: "Caixa, planos e pagamentos.",
    section: "workspace",
    mark: "siga-financeiro",
    target: { type: "route", to: "/financeiro" },
  },
  {
    id: "siga-faturas",
    name: "Faturas",
    shortName: "Faturas",
    description: "Emissão e consulta de faturas.",
    section: "workspace",
    mark: "siga-faturas",
    target: { type: "route", to: "/faturas" },
  },
  {
    id: "siga-documentos",
    name: "Documentos",
    shortName: "Documentos",
    description: "Declarações e emissão.",
    section: "workspace",
    mark: "siga-documentos",
    target: { type: "route", to: "/documentos" },
  },
  {
    id: "siga-arquivos",
    name: "Arquivos",
    shortName: "Arquivos",
    description: "PDF, Word, Excel e fotos da escola.",
    section: "workspace",
    mark: "siga-arquivos",
    target: { type: "route", to: "/arquivos" },
  },
  {
    id: "siga-comunicacoes",
    name: "Comunicados",
    shortName: "Comunicados",
    description: "Avisos à comunidade escolar.",
    section: "workspace",
    mark: "siga-comunicacoes",
    target: { type: "route", to: "/comunicacoes" },
  },
  {
    id: "siga-pessoas",
    name: "Pessoas",
    shortName: "Pessoas",
    description: "Colaboradores e docentes.",
    section: "workspace",
    mark: "siga-pessoas",
    target: { type: "route", to: "/pessoas" },
  },
  {
    id: "siga-relatorios-academicos",
    name: "Relatórios académicos",
    shortName: "Rel. académicos",
    description: "Pautas e indicadores de turma.",
    section: "workspace",
    mark: "siga-relatorios-academicos",
    target: { type: "route", to: "/relatorios/academicos" },
  },
  {
    id: "siga-relatorios-financeiros",
    name: "Relatórios financeiros",
    shortName: "Rel. financeiros",
    description: "Cobrança, dívida e caixa.",
    section: "workspace",
    mark: "siga-relatorios-financeiros",
    target: { type: "route", to: "/relatorios/financeiros" },
  },
  {
    id: "siga-acessos",
    name: "Acessos",
    shortName: "Acessos",
    description: "Contas, convites e permissões.",
    section: "workspace",
    mark: "siga-acessos",
    target: { type: "route", to: "/acessos" },
  },
  {
    id: "siga-matricula",
    name: "Matrícula pública",
    shortName: "Matrícula",
    description: "Link e página de candidaturas.",
    section: "workspace",
    mark: "siga-matricula",
    target: { type: "settings", panelId: "matricula" },
  },
];

export const launcherIntegrationApps: LauncherApp[] = academicIntegrationCatalog.map((item) => ({
  id: item.id,
  name: item.name,
  shortName: integrationShortNames[item.id] ?? item.name,
  description: item.description,
  section: catalogGroupToSection[item.group] ?? "integrations",
  mark: item.id,
  target: integrationTargets[item.id],
  catalogId: item.id,
}));

export const launcherHubSections: Array<{
  id: LauncherSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "workspace",
    label: "Módulos SIGA",
    description: "Funções do sistema de gestão escolar.",
  },
  {
    id: "payments",
    label: "Pagamentos",
    description: "Multicaixa Express e Unitel Money na tesouraria.",
  },
  {
    id: "communication",
    label: "Comunicação",
    description: "WhatsApp Business, Microsoft 365 e e-mail.",
  },
  {
    id: "academic",
    label: "Ensino",
    description: "Zoom, Teams, Classroom, Moodle, Canvas e originalidade.",
  },
  {
    id: "calendar",
    label: "Calendário",
    description: "Google Calendar e feed ICS para telemóvel.",
  },
  {
    id: "state",
    label: "Estado",
    description: "SIGE e AGT — educação nacional e obrigações fiscais.",
  },
];

const COMPACT_SERVICE_IDS = [
  "multicaixa_express",
  "unitel_money",
  "agt",
  "whatsapp_business",
  "resend_email",
] as const;

const COMPACT_TEACHING_IDS = [
  "zoom",
  "teams",
  "google_classroom",
  "moodle",
  "canvas",
  "microsoft_365_education",
  "google_calendar",
  "apple_calendar",
  "turnitin",
  "sige",
] as const;

export const teachingBundleIds = [
  "zoom",
  "teams",
  "google_classroom",
  "moodle",
  "canvas",
  "turnitin",
] as const;

const INTEGRATION_FOCUS_KEY = "siga:focus-integration";

export function integrationAnchorId(provider: string) {
  return `integration-${provider}`;
}

export function requestIntegrationFocus(provider: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(INTEGRATION_FOCUS_KEY, provider);
}

export function consumeIntegrationFocus() {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(INTEGRATION_FOCUS_KEY);
  if (id) sessionStorage.removeItem(INTEGRATION_FOCUS_KEY);
  return id;
}

export function allLauncherApps() {
  return [...launcherWorkspaceApps, ...launcherIntegrationApps];
}

export function launcherAppPath(app: LauncherApp) {
  if (app.target.type === "route") return app.target.to;
  if (app.target.type === "ics") return "/calendario";
  return "/configuracoes";
}

export function hrefForLauncherApp(app: LauncherApp) {
  if (app.target.type === "settings") {
    const query = app.target.panelId
      ? `?painel=${encodeURIComponent(app.target.panelId)}`
      : "";
    return `/configuracoes${query}`;
  }
  if (app.target.type === "ics") return "/calendario";
  const query = app.target.search ? `?${new URLSearchParams(app.target.search)}` : "";
  return `${app.target.to}${query}`;
}

export function canOpenLauncherApp(
  app: LauncherApp,
  role: string,
  grants: ModuleGrantMap = {},
) {
  if (app.target.type === "settings") return canAccessPath("/configuracoes", role, grants);
  if (app.target.type === "ics") return canAccessPath("/calendario", role, grants);
  return canAccessPath(app.target.to, role, grants);
}

export function integrationStatusLabel(status: string) {
  if (status === "connected") return "Ligado";
  if (status === "configured") return "Configurado";
  if (status === "error") return "Erro";
  return "Não ligado";
}

export function isIntegrationActive(status: string | undefined) {
  return status === "connected" || status === "configured";
}

export function appsForHubSection(sectionId: LauncherSectionId) {
  if (sectionId === "integrations") return launcherIntegrationApps;
  if (sectionId === "workspace") return launcherWorkspaceApps;
  if (sectionId === "academic") {
    return launcherIntegrationApps.filter(
      (app) => app.section === "academic" || app.section === "lessons",
    );
  }
  return launcherIntegrationApps.filter((app) => app.section === sectionId);
}

export function filterAccessibleApps(
  apps: LauncherApp[],
  role: string,
  grants: ModuleGrantMap = {},
) {
  return apps.filter((app) => canOpenLauncherApp(app, role, grants));
}

export function sortIntegrationsByStatus(
  apps: LauncherApp[],
  statusByProvider: Map<string, string> = new Map(),
) {
  const rank = (app: LauncherApp) => {
    const status = app.catalogId ? statusByProvider.get(app.catalogId) : undefined;
    if (status === "connected") return 0;
    if (status === "configured") return 1;
    if (status === "error") return 2;
    return 3;
  };
  return [...apps].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "pt"));
}

export function matchesLauncherQuery(app: LauncherApp, query: string) {
  const needle = query.trim().toLocaleLowerCase("pt");
  if (!needle) return true;
  return [app.name, app.shortName, app.description].some((value) =>
    value.toLocaleLowerCase("pt").includes(needle),
  );
}

export function searchLauncherApps(
  query: string,
  role: string,
  grants: ModuleGrantMap = {},
  statusByProvider: Map<string, string> = new Map(),
) {
  const matches = filterAccessibleApps(allLauncherApps(), role, grants).filter((app) =>
    matchesLauncherQuery(app, query),
  );
  return sortIntegrationsByStatus(matches, statusByProvider);
}

export function isLauncherAppCurrent(app: LauncherApp, pathname: string, search = "") {
  if (app.target.type === "ics") return pathname === "/calendario" || pathname.startsWith("/calendario/");
  if (app.target.type !== "route") return false;
  if (app.target.to === "/") return pathname === "/";
  const onRoute = pathname === app.target.to || pathname.startsWith(`${app.target.to}/`);
  if (!onRoute) return false;
  if (app.target.search?.["tab"]) {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab") ===
      app.target.search["tab"];
  }
  return true;
}

export function teachingBundleApps() {
  return launcherIntegrationApps.filter((app) =>
    (teachingBundleIds as readonly string[]).includes(app.id),
  );
}

export function compactLauncherSections(input?: {
  role?: string;
  grants?: ModuleGrantMap;
  statusByProvider?: Map<string, string>;
}) {
  const role = input?.role ?? "Administrador";
  const grants = input?.grants ?? {};
  const statusByProvider = input?.statusByProvider ?? new Map<string, string>();
  const accessible = (apps: LauncherApp[]) => filterAccessibleApps(apps, role, grants);

  const pick = (ids: readonly string[]) =>
    sortIntegrationsByStatus(
      accessible(launcherIntegrationApps.filter((app) => ids.includes(app.id))),
      statusByProvider,
    );

  return [
    {
      id: "workspace" as const,
      label: "Espaço de trabalho SIGA",
      apps: accessible(launcherWorkspaceApps),
    },
    {
      id: "payments" as const,
      label: "Serviços da escola",
      apps: pick(COMPACT_SERVICE_IDS),
    },
    {
      id: "academic" as const,
      label: "Ensino e aulas",
      apps: pick(COMPACT_TEACHING_IDS),
    },
  ].filter((section) => section.apps.length > 0);
}
