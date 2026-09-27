/**
 * Fluxo da pauta (puro): estados, acções permitidas e pré-pauta.
 *
 * As transições espelham `transition_grade_sheet` na base, que é quem decide
 * (permissões `assessment.grades.submit|homologate|reopen`,
 * `assessment.complaints.manage`, e 2FA). Aqui só se mostra o que faz sentido
 * pedir em cada estado.
 */

export const GRADE_SHEET_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "homologated",
  "published",
  "contested",
  "rectified",
  "closed",
] as const;
export type GradeSheetStatus = (typeof GRADE_SHEET_STATUSES)[number];

export const GRADE_SHEET_STATUS_LABELS: Record<GradeSheetStatus, string> = {
  draft: "Rascunho",
  submitted: "Submetida",
  in_review: "Em validação",
  homologated: "Homologada",
  published: "Publicada",
  contested: "Contestada",
  rectified: "Rectificada",
  closed: "Fechada",
};

/** Percurso principal, para o indicador de passos. */
export const GRADE_SHEET_MAIN_PATH: GradeSheetStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "homologated",
  "published",
  "closed",
];

export type GradeSheetAction = {
  /** Estado seguinte, ou "rebuild" para recalcular (volta a rascunho). */
  next: GradeSheetStatus | "rebuild";
  label: string;
  primary?: boolean;
  needsReason?: boolean;
  /** Bloqueada enquanto a pré-pauta tiver problemas. */
  requiresCleanPrePauta?: boolean;
};

export function gradeSheetActions(status: GradeSheetStatus): GradeSheetAction[] {
  switch (status) {
    case "draft":
      return [
        {
          next: "submitted",
          label: "Submeter à coordenação",
          primary: true,
          requiresCleanPrePauta: true,
        },
        { next: "rebuild", label: "Recalcular" },
      ];
    case "rectified":
      return [
        {
          next: "submitted",
          label: "Submeter de novo",
          primary: true,
          requiresCleanPrePauta: true,
        },
        { next: "homologated", label: "Homologar", requiresCleanPrePauta: true },
        { next: "rebuild", label: "Recalcular" },
      ];
    case "submitted":
      return [
        { next: "in_review", label: "Iniciar validação", primary: true },
        { next: "homologated", label: "Homologar", requiresCleanPrePauta: true },
        { next: "rebuild", label: "Devolver para correcção" },
      ];
    case "in_review":
      return [
        {
          next: "homologated",
          label: "Validar e homologar",
          primary: true,
          requiresCleanPrePauta: true,
        },
        { next: "rebuild", label: "Devolver para correcção" },
      ];
    case "homologated":
      return [
        { next: "published", label: "Publicar", primary: true },
        { next: "closed", label: "Fechar sem publicar" },
      ];
    case "published":
      return [
        { next: "closed", label: "Fechar pauta", primary: true },
        { next: "contested", label: "Registar contestação" },
        { next: "rectified", label: "Reabrir para rectificação", needsReason: true },
      ];
    case "contested":
    case "closed":
      return [{ next: "rectified", label: "Reabrir para rectificação", needsReason: true }];
  }
}

/** Publicada ou fechada: ninguém altera directamente, só por rectificação. */
export function isGradeSheetLocked(status: GradeSheetStatus) {
  return status === "published" || status === "closed" || status === "contested";
}

/**
 * Recalcular apaga e refaz as linhas da pauta. A base só protege o estado
 * de publicadas/fechadas, não as linhas — por isso o servidor recusa aqui.
 */
export function canRebuildGradeSheet(status: GradeSheetStatus | null) {
  return status === null || ["draft", "submitted", "in_review", "rectified"].includes(status);
}

export type PrePautaSubject = {
  subjectName: string;
  hasTeacher: boolean;
  gradebookStatus: string | null;
  missingMac: number;
  missingNpt: number;
  outOfScale: number;
  pendingChanges: number;
};

export type PrePautaCheck = { id: string; label: string; ok: boolean; detail?: string };

const list = (names: string[]) =>
  names.length <= 3
    ? names.join(", ")
    : `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}`;

/** Verificações da pré-pauta de uma turma num período. */
export function buildPrePautaChecks(input: {
  enrolled: number;
  hasActiveRule: boolean;
  subjects: PrePautaSubject[];
}): PrePautaCheck[] {
  const s = input.subjects;
  const withoutTeacher = s.filter((x) => !x.hasTeacher).map((x) => x.subjectName);
  const openBooks = s
    .filter((x) => !["submitted", "closed"].includes(x.gradebookStatus ?? ""))
    .map((x) => x.subjectName);
  const missing = s.filter((x) => x.missingMac + x.missingNpt > 0);
  const missingTotal = missing.reduce((sum, x) => sum + x.missingMac + x.missingNpt, 0);
  const outOfScale = s.reduce((sum, x) => sum + x.outOfScale, 0);
  const pending = s.reduce((sum, x) => sum + x.pendingChanges, 0);
  return [
    {
      id: "rule",
      label: "Regra de avaliação activa",
      ok: input.hasActiveRule,
      detail: input.hasActiveRule ? undefined : "A escola não tem regra de avaliação activa.",
    },
    {
      id: "enrolled",
      label: "Turma com alunos matriculados",
      ok: input.enrolled > 0,
      detail: input.enrolled > 0 ? `${input.enrolled} alunos` : "Sem matrículas activas.",
    },
    {
      id: "teachers",
      label: "Todas as disciplinas com professor",
      ok: withoutTeacher.length === 0,
      detail: withoutTeacher.length ? `Sem professor: ${list(withoutTeacher)}` : undefined,
    },
    {
      id: "gradebooks",
      label: "Diários submetidos ou fechados",
      ok: openBooks.length === 0,
      detail: openBooks.length ? `Por submeter: ${list(openBooks)}` : undefined,
    },
    {
      id: "missing",
      label: "Sem notas em falta (MAC e NPT)",
      ok: missingTotal === 0,
      detail: missingTotal
        ? `${missingTotal} em falta em ${list(missing.map((x) => x.subjectName))}`
        : undefined,
    },
    {
      id: "scale",
      label: "Notas dentro da escala 0–20",
      ok: outOfScale === 0,
      detail: outOfScale ? `${outOfScale} fora da escala` : undefined,
    },
    {
      id: "pending",
      label: "Sem alterações de nota pendentes",
      ok: pending === 0,
      detail: pending ? `${pending} à espera de aprovação` : undefined,
    },
  ];
}

export function prePautaIsClean(checks: PrePautaCheck[]) {
  return checks.every((check) => check.ok);
}

export const GRADE_RESULT_LABELS: Record<string, string> = {
  pass: "Transita",
  fail: "Não transita",
  incomplete: "Incompleto",
};
