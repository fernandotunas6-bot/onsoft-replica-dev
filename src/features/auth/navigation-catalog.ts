import type { LauncherApp, LauncherTarget } from "@/features/integrations/launcher-types";

export type WorkspaceModuleSpec = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  mark: string;
  navPath: string;
  target: LauncherTarget;
};

export const WORKSPACE_MODULE_SPECS: WorkspaceModuleSpec[] = [
  {
    id: "siga-dashboard",
    name: "Início",
    shortName: "Início",
    description: "Painel e atalhos do dia.",
    mark: "siga-dashboard",
    navPath: "/",
    target: { type: "route", to: "/" },
  },
  {
    id: "siga-alunos",
    name: "Alunos",
    shortName: "Alunos",
    description: "Fichas, matrícula e estado.",
    mark: "siga-alunos",
    navPath: "/alunos",
    target: { type: "route", to: "/alunos" },
  },
  {
    id: "siga-alumni",
    name: "Alumni",
    shortName: "Alumni",
    description: "Antigos alunos, carreira, mentoria e impacto.",
    mark: "siga-alumni",
    navPath: "/alumni",
    target: { type: "route", to: "/alumni" },
  },
  {
    id: "siga-pedagogica",
    name: "Pedagógica",
    shortName: "Pedagógica",
    description: "Turmas, notas e horários.",
    mark: "siga-pedagogica",
    navPath: "/pedagogica",
    target: { type: "route", to: "/pedagogica" },
  },
  {
    id: "siga-calendario",
    name: "Calendário",
    shortName: "Calendário",
    description: "Períodos lectivos e ICS.",
    mark: "siga-calendario",
    navPath: "/calendario",
    target: { type: "route", to: "/calendario" },
  },
  {
    id: "siga-planos-aula",
    name: "Planos de Aula",
    shortName: "Planos de Aula",
    description: "Estruturas de aula e avaliação.",
    mark: "siga-planos-aula",
    navPath: "/planos-aula",
    target: { type: "route", to: "/planos-aula" },
  },
  {
    id: "siga-comunicacoes",
    name: "Comunicações",
    shortName: "Comunicações",
    description: "Mensagens, avisos e anúncios.",
    mark: "siga-comunicacoes",
    navPath: "/comunicacoes",
    target: { type: "route", to: "/comunicacoes" },
  },
  {
    id: "siga-documentos",
    name: "Documentos",
    shortName: "Documentos",
    description: "Declarações e emissão oficial.",
    mark: "siga-documentos",
    navPath: "/documentos",
    target: { type: "route", to: "/documentos" },
  },
  {
    id: "siga-pessoas",
    name: "Pessoas",
    shortName: "Pessoas",
    description: "Directório e utilizadores.",
    mark: "siga-pessoas",
    navPath: "/pessoas",
    target: { type: "route", to: "/pessoas" },
  },
  {
    id: "siga-financeiro",
    name: "Financeiro",
    shortName: "Financeiro",
    description: "Facturação e pagamentos.",
    mark: "siga-financeiro",
    navPath: "/financeiro",
    target: { type: "route", to: "/financeiro" },
  },
  {
    id: "siga-rh",
    name: "Recursos Humanos",
    shortName: "RH",
    description: "Funcionários, contratos e presenças.",
    mark: "siga-rh",
    navPath: "/financeiro/rh",
    target: { type: "route", to: "/financeiro/rh" },
  },
  {
    id: "siga-arquivos",
    name: "Arquivos",
    shortName: "Arquivos",
    description: "Biblioteca digital e anexos.",
    mark: "siga-arquivos",
    navPath: "/arquivos",
    target: { type: "route", to: "/arquivos" },
  },
  {
    id: "siga-importar",
    name: "Importar",
    shortName: "Importar",
    description: "Carga de dados por folha de cálculo.",
    mark: "siga-importar",
    navPath: "/importar",
    target: { type: "route", to: "/importar" },
  },
  {
    id: "siga-relatorios-academicos",
    name: "Relatórios académicos",
    shortName: "Rel. académicos",
    description: "Pautas e indicadores de turma.",
    mark: "siga-relatorios-academicos",
    navPath: "/relatorios/academicos",
    target: { type: "route", to: "/relatorios/academicos" },
  },
  {
    id: "siga-relatorios-financeiros",
    name: "Relatórios financeiros",
    shortName: "Rel. financeiros",
    description: "Cobrança, dívida e caixa.",
    mark: "siga-relatorios-financeiros",
    navPath: "/relatorios/financeiros",
    target: { type: "route", to: "/relatorios/financeiros" },
  },
  {
    id: "siga-catracas",
    name: "Catracas & Cartão Virtual",
    shortName: "Catracas",
    description: "Controlo de acesso físico e cartões digitais.",
    mark: "siga-catracas",
    navPath: "/catracas",
    target: { type: "route", to: "/catracas" },
  },
  {
    id: "siga-acessos",
    name: "Acessos",
    shortName: "Acessos",
    description: "Contas, convites e permissões.",
    mark: "siga-acessos",
    navPath: "/acessos",
    target: { type: "route", to: "/acessos" },
  },
  {
    id: "siga-matricula",
    name: "Matrícula pública",
    shortName: "Matrícula",
    description: "Link e página de candidaturas.",
    mark: "siga-matricula",
    navPath: "/configuracoes",
    target: { type: "settings", panelId: "matricula" },
  },
];

export const ADMIN_NAV_PATH_COVERAGE = [
  ...WORKSPACE_MODULE_SPECS.map((spec) => spec.navPath),
  "/perfil",
] as const;

export function buildWorkspaceLauncherApps(): LauncherApp[] {
  return WORKSPACE_MODULE_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    description: spec.description,
    section: "workspace",
    mark: spec.mark,
    target: spec.target,
  }));
}

type NavItemLike = { to?: string; children?: Array<{ to: string }> };

export function collectNavPaths(groups: Array<{ items: NavItemLike[] }>): Set<string> {
  const paths = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (item.to) paths.add(item.to);
      for (const child of item.children ?? []) if (child.to) paths.add(child.to);
    }
  }
  return paths;
}

export function missingAdminNavPaths(paths: Set<string>): string[] {
  return ADMIN_NAV_PATH_COVERAGE.filter((path) => !paths.has(path));
}

/** Valida que cada módulo do inventário (`modules.json`) tem rota na sidebar admin. */
export function missingModuleNavPaths(moduleRoutes: string[], adminPaths: Set<string>): string[] {
  return moduleRoutes.filter((path) => !adminPaths.has(path));
}

export function inventoryNavPaths(
  modules: Array<{ navPath?: string; secondaryNavPaths?: string[] }>,
): string[] {
  const paths = new Set<string>();
  for (const mod of modules) {
    if (mod.navPath) paths.add(mod.navPath);
    for (const route of mod.secondaryNavPaths ?? []) paths.add(route);
  }
  return [...paths];
}
