export const applicationRoles = [
  "Administrador",
  "Secretaria",
  "Tesouraria",
  "Professor",
  "Encarregado",
  "Utilizador",
] as const;

export type ApplicationRole = (typeof applicationRoles)[number];

export const accessModules = [
  { key: "dashboard", label: "Dashboard", prefixes: ["/"] },
  {
    key: "pessoas",
    label: "Pessoas / Alunos",
    prefixes: ["/pessoas", "/alunos", "/documentos", "/professores"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    prefixes: ["/financeiro", "/faturas", "/relatorios/financeiros"],
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
  { key: "gestao", label: "Acessos / Config", prefixes: ["/acessos", "/configuracoes"] },
  { key: "arquivos", label: "Arquivos", prefixes: ["/arquivos"] },
  { key: "importacao", label: "Importar Dados", prefixes: ["/importar"] },
] as const;

const accessRules: Array<{ prefixes: string[]; roles: ApplicationRole[] }> = [
  { prefixes: ["/"], roles: ["Administrador", "Secretaria", "Tesouraria", "Professor"] },
  { prefixes: ["/acessos"], roles: ["Administrador", "Secretaria"] },
  { prefixes: ["/configuracoes"], roles: ["Administrador"] },
  {
    prefixes: ["/financeiro", "/faturas", "/relatorios/financeiros"],
    roles: ["Administrador", "Tesouraria"],
  },
  {
    prefixes: ["/pessoas", "/alunos", "/documentos"],
    roles: ["Administrador", "Secretaria"],
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
    roles: ["Administrador", "Secretaria", "Professor"],
  },
  {
    prefixes: ["/arquivos"],
    roles: ["Administrador", "Secretaria", "Tesouraria", "Professor"],
  },
  {
    // Gate de página — o módulo pedido (pessoas, alunos, pagamentos...) é
    // validado à parte no servidor por rolesForModule() em import/server.ts.
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

export function canAccessPath(pathname: string, role: string, grants: ModuleGrantMap = {}) {
  if (
    pathname === "/alterar-senha" ||
    pathname.startsWith("/matricula") ||
    pathname.startsWith("/calendario/ics")
  ) {
    return true;
  }
  const module = moduleForPath(pathname);
  if (module) {
    const grant = grants[module.key];
    if (grant === "Nenhum") return false;
    if (grant) return true;
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
  if (granted) return granted;
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
