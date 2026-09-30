/**
 * Guia de arranque de uma escola nova.
 *
 * Uma escola acabada de criar tem conta, papéis e definições, mas não tem o
 * que a deixa trabalhar: ano lectivo, trimestres, classes, turmas, modelo de
 * avaliação, propinas, equipa e alunos. O bloco «Primeiros passos» anterior
 * mandava matricular o primeiro aluno antes de existirem turmas ou modelo de
 * avaliação, e não dizia o que já estava feito.
 *
 * A ordem aqui segue as dependências reais do SIGA:
 *   - sem ano lectivo activo não há trimestres, turmas nem planos de propina
 *     (`fee_plans.academic_year_id` e `class_groups.academic_year_id`);
 *   - o modelo de estrutura cria as turmas no ano lectivo activo;
 *   - sem modelo de avaliação não há pautas;
 *   - a matrícula põe o aluno numa turma e gera as propinas.
 *
 * Cada passo é decidido pelo que está na base — nunca por uma marca de
 * «concluído» que a pessoa carregou. Este ficheiro é lógica pura (sem base,
 * sem React) para ser testado; os números vêm de `setup-guide-server.ts`.
 */

export type SetupCounts = {
  school: {
    nif: boolean;
    director: boolean;
    contact: boolean;
    logo: boolean;
  };
  activeYear: { name: string } | null;
  termsInActiveYear: number;
  programs: number;
  gradeLevels: number;
  subjects: number;
  classGroupsInActiveYear: number;
  rooms: number;
  assessmentModel: boolean;
  activeFeePlanWithItems: boolean;
  /** Membros activos além do próprio administrador. */
  otherMembers: number;
  pendingInvitations: number;
  students: number;
  publicEnrollmentOpen: boolean;
};

export type SetupStepId =
  | "escola"
  | "ano"
  | "trimestres"
  | "estrutura"
  | "disciplinas"
  | "turmas"
  | "avaliacao"
  | "propinas"
  | "equipa"
  | "alunos"
  | "matricula";

export type SetupAction =
  | { kind: "route"; to: string; search?: Record<string, string> }
  | { kind: "settings"; panel: string };

export type SetupStep = {
  id: SetupStepId;
  /** Fase do arranque — agrupa os passos no ecrã. */
  phase: "Base" | "Pedagógica" | "Financeiro" | "Pessoas";
  title: string;
  /** Porque é preciso, numa frase. */
  why: string;
  /** Estado lido da base, para a pessoa confirmar o que já existe. */
  detail: string;
  done: boolean;
  optional: boolean;
  /** Passos obrigatórios que têm de estar feitos antes deste. */
  blockedBy: SetupStepId[];
  action: SetupAction;
  actionLabel: string;
};

export type SetupGuide = {
  steps: SetupStep[];
  /** Passos obrigatórios concluídos / total de obrigatórios. */
  completed: number;
  total: number;
  /** O primeiro passo obrigatório por fazer e desbloqueado. */
  nextStepId: SetupStepId | null;
  ready: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSetupGuide(counts: SetupCounts): SetupGuide {
  const school = counts.school;
  const schoolMissing = [
    !school.nif && "NIF",
    !school.director && "director(a)",
    !school.contact && "telefone ou e-mail",
  ].filter(Boolean) as string[];

  const raw: Array<Omit<SetupStep, "blockedBy"> & { requires: SetupStepId[] }> = [
    {
      id: "escola",
      phase: "Base",
      title: "Confirmar os dados da escola",
      why: "Saem em recibos, facturas, declarações e na exportação SAF-T para a AGT.",
      detail: schoolMissing.length
        ? `Em falta: ${schoolMissing.join(", ")}.`
        : school.logo
          ? "NIF, director(a), contactos e logótipo preenchidos."
          : "Dados preenchidos. Falta só o logótipo (opcional).",
      done: schoolMissing.length === 0,
      optional: false,
      requires: [],
      action: { kind: "settings", panel: "escola" },
      actionLabel: "Abrir dados da escola",
    },
    {
      id: "ano",
      phase: "Base",
      title: "Definir o ano lectivo",
      why: "Sem ano lectivo activo não há turmas, trimestres nem planos de propina.",
      detail: counts.activeYear
        ? `Activo: ${counts.activeYear.name}.`
        : "Nenhum ano lectivo activo.",
      done: Boolean(counts.activeYear),
      optional: false,
      requires: [],
      action: { kind: "route", to: "/calendario" },
      actionLabel: "Abrir calendário",
    },
    {
      id: "trimestres",
      phase: "Base",
      title: "Gravar os três trimestres",
      why: "As notas, as faltas e as pautas são lançadas por trimestre.",
      detail: `${counts.termsInActiveYear} de 3 trimestres com datas.`,
      done: counts.termsInActiveYear >= 3,
      optional: false,
      requires: ["ano"],
      action: { kind: "route", to: "/calendario" },
      actionLabel: "Gravar trimestres",
    },
    {
      id: "estrutura",
      phase: "Pedagógica",
      title: "Preparar cursos e classes",
      why: "Um modelo do MED cria classes (1ª–13ª), cursos, disciplinas, turmas e salas de uma vez.",
      detail:
        counts.programs || counts.gradeLevels
          ? `${plural(counts.programs, "curso", "cursos")} · ${plural(counts.gradeLevels, "classe", "classes")}.`
          : "Ainda sem cursos nem classes.",
      done: counts.programs > 0 && counts.gradeLevels > 0,
      optional: false,
      // O modelo de estrutura cria classes, cursos, disciplinas, turmas e salas
      // de uma vez; as turmas precisam do ano lectivo activo.
      requires: ["ano"],
      action: { kind: "route", to: "/pedagogica", search: { tab: "estrutura" } },
      actionLabel: "Usar modelo de estrutura",
    },
    {
      id: "disciplinas",
      phase: "Pedagógica",
      title: "Rever as disciplinas",
      why: "É por disciplina que o professor lança notas e faltas.",
      detail: counts.subjects
        ? `${plural(counts.subjects, "disciplina", "disciplinas")} activas.`
        : "Sem disciplinas.",
      done: counts.subjects > 0,
      optional: false,
      requires: ["estrutura"],
      action: { kind: "route", to: "/pedagogica", search: { tab: "disciplinas" } },
      actionLabel: "Abrir disciplinas",
    },
    {
      id: "turmas",
      phase: "Pedagógica",
      title: "Criar as turmas do ano",
      why: "A matrícula coloca o aluno numa turma; sem turma não há matrícula.",
      detail: counts.classGroupsInActiveYear
        ? `${plural(counts.classGroupsInActiveYear, "turma", "turmas")} no ano activo${
            counts.rooms ? ` · ${plural(counts.rooms, "sala", "salas")}` : ""
          }.`
        : "Sem turmas no ano activo.",
      done: counts.classGroupsInActiveYear > 0,
      optional: false,
      requires: ["ano", "estrutura"],
      action: { kind: "route", to: "/pedagogica", search: { tab: "turmas" } },
      actionLabel: "Abrir turmas",
    },
    {
      id: "avaliacao",
      phase: "Pedagógica",
      title: "Publicar o modelo de avaliação",
      why: "Define os pesos (MAC, provas, exame) e a nota mínima. Sem ele não há pautas.",
      detail: counts.assessmentModel ? "Modelo activo publicado." : "Nenhum modelo publicado.",
      done: counts.assessmentModel,
      optional: false,
      requires: [],
      action: { kind: "route", to: "/pedagogica", search: { tab: "modelos" } },
      actionLabel: "Abrir modelos de avaliação",
    },
    {
      id: "propinas",
      phase: "Financeiro",
      title: "Definir propina e matrícula",
      why: "Os valores geram as facturas de cada aluno matriculado.",
      detail: counts.activeFeePlanWithItems
        ? "Plano de propinas activo para o ano."
        : "Sem plano de propinas activo para o ano.",
      done: counts.activeFeePlanWithItems,
      optional: false,
      requires: ["ano"],
      action: { kind: "settings", panel: "financeiro" },
      actionLabel: "Abrir parâmetros financeiros",
    },
    {
      id: "equipa",
      phase: "Pessoas",
      title: "Convidar a equipa",
      why: "Secretaria, tesouraria e professores entram com a sua própria conta e permissões.",
      detail:
        counts.otherMembers || counts.pendingInvitations
          ? `${plural(counts.otherMembers, "membro activo", "membros activos")}${
              counts.pendingInvitations
                ? ` · ${plural(counts.pendingInvitations, "convite pendente", "convites pendentes")}`
                : ""
            }.`
          : "Só o administrador tem acesso.",
      done: counts.otherMembers > 0 || counts.pendingInvitations > 0,
      optional: false,
      requires: [],
      action: { kind: "route", to: "/acessos" },
      actionLabel: "Abrir acessos",
    },
    {
      id: "alunos",
      phase: "Pessoas",
      title: "Matricular ou importar os alunos",
      why: "Com turmas e propinas prontas, cada matrícula já sai com turma e facturas.",
      detail: counts.students
        ? `${plural(counts.students, "aluno registado", "alunos registados")}.`
        : "Ainda sem alunos.",
      done: counts.students > 0,
      optional: false,
      requires: ["turmas", "propinas"],
      action: { kind: "route", to: "/alunos", search: { action: "matricular" } },
      actionLabel: "Matricular aluno",
    },
    {
      id: "matricula",
      phase: "Pessoas",
      title: "Abrir a matrícula online",
      why: "As famílias candidatam-se por um link; a secretaria só confirma.",
      detail: counts.publicEnrollmentOpen ? "Link público aberto." : "Link público fechado.",
      done: counts.publicEnrollmentOpen,
      optional: true,
      requires: ["turmas"],
      action: { kind: "settings", panel: "matricula" },
      actionLabel: "Configurar matrícula online",
    },
  ];

  const doneById = new Map(raw.map((step) => [step.id, step.done]));
  const steps: SetupStep[] = raw.map(({ requires, ...step }) => ({
    ...step,
    blockedBy: requires.filter((id) => !doneById.get(id)),
  }));

  const required = steps.filter((step) => !step.optional);
  const completed = required.filter((step) => step.done).length;
  const next = required.find((step) => !step.done && step.blockedBy.length === 0) ?? null;

  return {
    steps,
    completed,
    total: required.length,
    nextStepId: next?.id ?? null,
    ready: completed === required.length,
  };
}

/** Rótulo curto de um passo, para «Primeiro: …» nos passos bloqueados. */
export function setupStepTitle(guide: SetupGuide, id: SetupStepId): string {
  return guide.steps.find((step) => step.id === id)?.title ?? id;
}
