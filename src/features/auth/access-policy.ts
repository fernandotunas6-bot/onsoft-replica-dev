import type { Plan } from "@/features/saas/types";
import { planIncludesModule } from "@/features/saas/plan-features";

export const applicationRoles = [
  "Administrador",
  "Secretaria",
  "Tesouraria",
  "Professor",
  "Encarregado",
  "Aluno",
  "Utilizador",
] as const;

export type ApplicationRole = (typeof applicationRoles)[number];

/**
 * Cargos que uma permissão por módulo pode elevar. Alunos e encarregados, nunca.
 * A mesma lista decide no servidor (`grantElevates` em sga-admin) e no ecrã.
 */
export const GRANT_ELEVATABLE_ROLES: readonly ApplicationRole[] = [
  "Secretaria",
  "Tesouraria",
  "Professor",
];

/**
 * Áreas que só o cargo abre. A permissão por módulo alarga o departamento
 * (p.ex. Financeiro a um Professor), mas não estas: o servidor também só as
 * aceita pelo cargo — RH e folha salarial (`requireHrReader`,
 * `requirePayrollAdmin`) e as configurações da escola (só Administrador).
 */
const roleOnlyPrefixes = ["/financeiro/rh", "/configuracoes"] as const;

export const accessModules = [
  { key: "dashboard", label: "Dashboard", prefixes: ["/"] },
  {
    key: "pessoas",
    label: "Pessoas / Alunos / Alumni",
    prefixes: ["/pessoas", "/alunos", "/alumni", "/documentos", "/professores"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    prefixes: ["/financeiro", "/faturas", "/relatorios/financeiros", "/tesouraria"],
  },
  {
    key: "pedagogica",
    label: "Pedagógica",
    prefixes: [
      "/pedagogica",
      "/calendario",
      "/relatorios/academicos",
      "/comunicacoes",
      "/planos-aula",
    ],
  },
  {
    key: "gestao",
    label: "Acessos / Config",
    prefixes: ["/acessos", "/configuracoes", "/catracas"],
  },
  { key: "arquivos", label: "Arquivos", prefixes: ["/arquivos"] },
  { key: "importacao", label: "Importar Dados", prefixes: ["/importar"] },
] as const;

const accessRules: Array<{ prefixes: string[]; roles: ApplicationRole[] }> = [
  {
    prefixes: ["/"],
    roles: ["Administrador", "Secretaria", "Tesouraria", "Professor", "Encarregado", "Aluno"],
  },
  { prefixes: ["/alumni"], roles: ["Administrador", "Secretaria"] },
  { prefixes: ["/acessos", "/catracas"], roles: ["Administrador", "Secretaria"] },
  { prefixes: ["/configuracoes"], roles: ["Administrador"] },
  { prefixes: ["/tesouraria"], roles: ["Administrador", "Tesouraria"] },
  {
    prefixes: ["/faturas", "/relatorios/financeiros"],
    roles: ["Administrador", "Tesouraria"],
  },
  // Mais específico do que /financeiro — bloquear RH a alunos/encarregados.
  {
    prefixes: ["/financeiro/rh"],
    roles: ["Administrador", "Tesouraria"],
  },
  {
    prefixes: ["/professor/presenca"],
    roles: ["Administrador", "Tesouraria", "Professor"],
  },
  {
    prefixes: ["/financeiro"],
    roles: ["Administrador", "Tesouraria", "Encarregado", "Aluno"],
  },
  {
    prefixes: ["/pessoas", "/alunos", "/documentos"],
    roles: ["Administrador", "Secretaria", "Encarregado", "Aluno"],
  },
  {
    prefixes: ["/professores"],
    roles: ["Administrador", "Secretaria", "Professor"],
  },
  {
    prefixes: [
      "/pedagogica",
      "/calendario",
      "/relatorios/academicos",
      "/comunicacoes",
      "/planos-aula",
    ],
    roles: ["Administrador", "Secretaria", "Professor", "Encarregado", "Aluno"],
  },
  {
    prefixes: ["/arquivos"],
    roles: ["Administrador", "Secretaria", "Tesouraria", "Professor", "Aluno"],
  },
  {
    prefixes: ["/importar"],
    roles: ["Administrador", "Secretaria", "Tesouraria"],
  },
];

export type AccessLevel = "Nenhum" | "Leitura" | "Escrita" | "Total";
export type ModuleGrantMap = Partial<Record<(typeof accessModules)[number]["key"], AccessLevel>>;

function moduleForPath(pathname: string) {
  const matches = accessModules.flatMap((item) =>
    item.prefixes
      .filter((prefix) =>
        prefix === "/"
          ? pathname === "/"
          : pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
      .map((prefix) => ({ item, prefix })),
  );
  matches.sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0]?.item;
}

export function canAccessPath(
  pathname: string,
  role: string,
  grants: ModuleGrantMap = {},
  plan?: Plan | null,
) {
  if (
    pathname === "/alterar-senha" ||
    pathname === "/perfil" ||
    pathname === "/criar-escola" ||
    pathname === "/saas-admin" ||
    pathname.startsWith("/matricula") ||
    pathname === "/verificar" ||
    pathname.startsWith("/convite") ||
    pathname.startsWith("/calendario/ics") ||
    pathname.startsWith("/api/")
  ) {
    return true;
  }

  if (pathname === "/alumni/portal" || pathname.startsWith("/alumni/portal/")) {
    if (plan && !planIncludesModule(plan, "pessoas")) return false;
    if (grants.pessoas === "Nenhum") return false;
    return ["Administrador", "Secretaria", "Aluno"].includes(role);
  }

  const module = moduleForPath(pathname);
  if (module) {
    if (plan && !planIncludesModule(plan, module.key)) return false;
    const grant = grants[module.key];
    if (grant === "Nenhum") return false;
    const roleOnly = roleOnlyPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (grant && !roleOnly && GRANT_ELEVATABLE_ROLES.some((allowed) => allowed === role)) {
      return true;
    }
  }

  const rule = accessRules.find(({ prefixes }) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  if (!rule) return pathname === "/alterar-senha";
  return rule.roles.some((allowedRole) => allowedRole === role);
}

export function accessLevelForRole(
  role: string,
  moduleKey: (typeof accessModules)[number]["key"],
  grants: ModuleGrantMap = {},
): AccessLevel {
  const granted = grants[moduleKey];
  // Em alunos e encarregados a permissão só retira ("Nenhum"), nunca alarga.
  if (granted === "Nenhum") return granted;
  if (granted && (role === "Administrador" || GRANT_ELEVATABLE_ROLES.some((r) => r === role))) {
    return granted;
  }
  const module = accessModules.find((item) => item.key === moduleKey);
  if (!module) return "Nenhum";
  if (role === "Administrador") return "Total";
  const allowed = module.prefixes.some((prefix) => canAccessPath(prefix, role));
  if (!allowed) return "Nenhum";
  if (moduleKey === "financeiro" && role === "Tesouraria") return "Total";
  if (moduleKey === "pessoas" && role === "Secretaria") return "Total";
  if (moduleKey === "pedagogica" && (role === "Secretaria" || role === "Professor")) {
    return role === "Professor" ? "Leitura" : "Escrita";
  }
  if (moduleKey === "dashboard") return "Leitura";
  if (moduleKey === "arquivos") {
    if (role === "Administrador" || role === "Secretaria") return "Total";
    return "Escrita";
  }
  if (moduleKey === "importacao") {
    if (role === "Administrador" || role === "Secretaria" || role === "Tesouraria") return "Total";
    return "Nenhum";
  }
  return "Leitura";
}

export function canReadModule(
  role: string,
  moduleKey: (typeof accessModules)[number]["key"],
  grants: ModuleGrantMap = {},
) {
  return accessLevelForRole(role, moduleKey, grants) !== "Nenhum";
}

export function canWriteModule(
  role: string,
  moduleKey: (typeof accessModules)[number]["key"],
  grants: ModuleGrantMap = {},
) {
  const level = accessLevelForRole(role, moduleKey, grants);
  return level === "Escrita" || level === "Total";
}
