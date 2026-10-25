import {
  canReadModule,
  GRANT_ELEVATABLE_ROLES,
  type ApplicationRole,
  type ModuleGrantMap,
} from "@/features/auth/access-policy";

/**
 * Secções da ficha do aluno com URL própria: `/alunos/<id>?secao=financeiro`.
 * Sem secção a ficha mostra-se completa, como sempre. Cada secção só se mostra a
 * quem pode ler o que ela contém; pedida sem acesso, ou desconhecida, a página
 * mostra a ficha completa. O servidor continua a validar cada leitura.
 */

export const STUDENT_SECTIONS = [
  { id: "identificacao", label: "Identificação" },
  { id: "academico", label: "Académico" },
  { id: "financeiro", label: "Financeiro" },
  { id: "documentos", label: "Documentos" },
] as const;

export type StudentSection = (typeof STUDENT_SECTIONS)[number]["id"];

export type StudentDetailSearch = { secao?: StudentSection };

export function studentSectionLabel(section: StudentSection): string {
  return STUDENT_SECTIONS.find((item) => item.id === section)?.label ?? section;
}

/** Um valor desconhecido na URL é ignorado: abre a ficha completa, sem erro. */
export function validateStudentDetailSearch(search: Record<string, unknown>): StudentDetailSearch {
  const value = search["secao"];
  const section = STUDENT_SECTIONS.find((item) => item.id === value);
  return section ? { secao: section.id } : {};
}

/**
 * Quem o servidor deixa ler as faturas e o desconto do aluno (`listInvoices`,
 * `getStudentScholarship`): estes cargos, salvo «Nenhum» no módulo financeiro,
 * ou outro cargo elevável com permissão desse módulo.
 */
export const STUDENT_FINANCE_ROLES: readonly ApplicationRole[] = [
  "Administrador",
  "Secretaria",
  "Tesouraria",
];

export function canReadStudentFinance(role: string, grants: ModuleGrantMap = {}): boolean {
  const level = grants.financeiro;
  if (STUDENT_FINANCE_ROLES.some((allowed) => allowed === role)) return level !== "Nenhum";
  return (
    GRANT_ELEVATABLE_ROLES.some((allowed) => allowed === role) &&
    (level === "Leitura" || level === "Escrita" || level === "Total")
  );
}

/** O módulo cuja leitura cada secção pede (o do servidor que lhe dá os dados). */
export function canReadStudentSection(
  section: StudentSection,
  role: string,
  grants: ModuleGrantMap = {},
): boolean {
  switch (section) {
    case "identificacao":
      return canReadModule(role, "pessoas", grants);
    case "academico":
      return canReadModule(role, "pedagogica", grants);
    case "financeiro":
      return canReadStudentFinance(role, grants);
    case "documentos":
      return canReadModule(role, "arquivos", grants);
  }
}

/**
 * A secção a mostrar (null = ficha completa) e a que foi pedida sem acesso,
 * para a página o dizer com discrição em vez de abrir uma secção vazia.
 */
export function resolveStudentSection(
  requested: StudentSection | undefined,
  role: string,
  grants: ModuleGrantMap = {},
): { section: StudentSection | null; refused: StudentSection | null } {
  if (!requested) return { section: null, refused: null };
  return canReadStudentSection(requested, role, grants)
    ? { section: requested, refused: null }
    : { section: null, refused: requested };
}
