/**
 * Assistente de configuração de uma escola nova: que passos existem, por que
 * ordem, e quando cada um conta como feito. Só regras puras — os números vêm
 * de `getSchoolSetupStatus` (setup-status.ts), que os lê na base.
 *
 * Não bloqueia o SIGA (decisão do dono, 2026-10-03): o assistente mostra o
 * progresso e leva a cada formulário, mas a escola pode trabalhar entretanto.
 */

export type SchoolSetupSnapshot = {
  school: {
    name: string;
    nif: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    hasLogo: boolean;
  };
  activeYearName: string | null;
  termsInActiveYear: number;
  gradeLevels: number;
  classGroupsInActiveYear: number;
  classSubjects: number;
  classSubjectsWithTeacher: number;
  activeTeachers: number;
  hasActiveAssessmentRule: boolean;
  /** Itens de propina activos com valor > 0 (o provisionamento cria-os a 0). */
  pricedFeeItems: number;
  hasBankIban: boolean;
  /** Outros membros activos da escola, além de quem está a configurar. */
  otherActiveMembers: number;
  /** Sessão actual com 2FA (aal2). */
  adminHasTwoFactor: boolean;
  enrollmentFormOpen: boolean;
  students: number;
};

export type SetupStepAction =
  { type: "panel"; panel: string } | { type: "route"; to: string; search?: Record<string, string> };

export type SetupStep = {
  id: string;
  group: "Escola" | "Ano lectivo" | "Ensino" | "Finanças" | "Equipa" | "Arranque";
  title: string;
  description: string;
  done: boolean;
  /** Sem este passo, outras partes do SIGA não funcionam. */
  essential: boolean;
  /** Estado em palavras: o que já existe ou o que falta. */
  detail: string;
  action: SetupStepAction;
  actionLabel: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSetupSteps(s: SchoolSetupSnapshot): SetupStep[] {
  const missingSchoolFields = [
    !s.school.nif && "NIF",
    !s.school.phone && "telefone",
    !s.school.email && "e-mail",
    !s.school.address && "morada",
  ].filter(Boolean) as string[];

  return [
    {
      id: "dados-escola",
      group: "Escola",
      title: "Dados da escola",
      description: "Nome, NIF, contactos e morada — saem nos recibos, declarações e pautas.",
      done: missingSchoolFields.length === 0,
      essential: true,
      detail: missingSchoolFields.length
        ? `Falta: ${missingSchoolFields.join(", ")}.`
        : `${s.school.name} · NIF ${s.school.nif}`,
      action: { type: "panel", panel: "escola" },
      actionLabel: "Abrir dados da escola",
    },
    {
      id: "logotipo",
      group: "Escola",
      title: "Logotipo e identidade",
      description: "O logótipo aparece nos documentos, no portal e nos e-mails da escola.",
      done: s.school.hasLogo,
      essential: false,
      detail: s.school.hasLogo ? "Logótipo carregado." : "Sem logótipo.",
      action: { type: "panel", panel: "escola" },
      actionLabel: "Carregar logótipo",
    },
    {
      id: "ano-lectivo",
      group: "Ano lectivo",
      title: "Ano lectivo activo",
      description: "Sem ano lectivo não há turmas, matrículas nem planos de propina.",
      done: Boolean(s.activeYearName),
      essential: true,
      detail: s.activeYearName ? `Activo: ${s.activeYearName}.` : "Nenhum ano lectivo activo.",
      action: { type: "route", to: "/calendario" },
      actionLabel: "Definir ano lectivo",
    },
    {
      id: "periodos",
      group: "Ano lectivo",
      title: "Períodos (trimestres)",
      description:
        "Datas de cada período. A pauta anual só fica completa com nota em todos os períodos.",
      done: s.termsInActiveYear >= 3,
      essential: true,
      detail: s.activeYearName
        ? s.termsInActiveYear
          ? `${plural(s.termsInActiveYear, "período", "períodos")} no ano activo${s.termsInActiveYear < 3 ? " — normalmente são 3." : "."}`
          : "Nenhum período criado."
        : "Defina primeiro o ano lectivo.",
      action: { type: "route", to: "/calendario" },
      actionLabel: "Abrir calendário",
    },
    {
      id: "estrutura",
      group: "Ensino",
      title: "Classes e turmas",
      description: "As classes que a escola lecciona e as turmas deste ano lectivo.",
      done: s.gradeLevels > 0 && s.classGroupsInActiveYear > 0,
      essential: true,
      detail:
        s.gradeLevels === 0
          ? "Sem classes. «Preparar estrutura académica» cria a base a partir dos níveis da escola."
          : `${plural(s.gradeLevels, "classe", "classes")} · ${plural(s.classGroupsInActiveYear, "turma", "turmas")} no ano activo.`,
      action: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
      actionLabel: "Abrir turmas",
    },
    {
      id: "disciplinas",
      group: "Ensino",
      title: "Disciplinas por turma",
      description: "Que disciplinas cada turma tem — base das cadernetas, pautas e horários.",
      done: s.classSubjects > 0,
      essential: true,
      detail: s.classSubjects
        ? `${plural(s.classSubjects, "disciplina atribuída", "disciplinas atribuídas")} às turmas.`
        : "Nenhuma disciplina atribuída a turmas.",
      action: { type: "route", to: "/pedagogica", search: { tab: "disciplinas" } },
      actionLabel: "Abrir disciplinas",
    },
    {
      id: "professores",
      group: "Ensino",
      title: "Professores nas disciplinas",
      description:
        "Cada disciplina com o seu professor: é isso que lhe abre a chamada, as notas e as turmas.",
      done: s.classSubjects > 0 && s.classSubjectsWithTeacher >= s.classSubjects,
      essential: false,
      detail:
        s.classSubjects === 0
          ? `${plural(s.activeTeachers, "professor activo", "professores activos")}. Atribua disciplinas primeiro.`
          : `${s.classSubjectsWithTeacher} de ${s.classSubjects} disciplinas com professor.`,
      action: { type: "route", to: "/pedagogica", search: { tab: "disciplinas" } },
      actionLabel: "Atribuir professores",
    },
    {
      id: "avaliacao",
      group: "Ensino",
      title: "Regras de avaliação",
      description: "Pesos MAC/NPP/NPT, nota mínima e limite de faltas — usados em todas as pautas.",
      done: s.hasActiveAssessmentRule,
      essential: true,
      detail: s.hasActiveAssessmentRule
        ? "Modelo de avaliação activo."
        : "Sem modelo activo: as pautas não se calculam.",
      action: { type: "route", to: "/pedagogica", search: { tab: "modelos" } },
      actionLabel: "Abrir modelos de avaliação",
    },
    {
      id: "propinas",
      group: "Finanças",
      title: "Valores de propina e matrícula",
      description: "O provisionamento cria os itens a 0 Kz — o preço é sempre da escola.",
      done: s.pricedFeeItems > 0,
      essential: true,
      detail: s.pricedFeeItems
        ? `${plural(s.pricedFeeItems, "item com valor", "itens com valor")}.`
        : "Propina e matrícula ainda a 0 Kz.",
      action: { type: "panel", panel: "financeiro" },
      actionLabel: "Definir valores",
    },
    {
      id: "iban",
      group: "Finanças",
      title: "Dados bancários (IBAN)",
      description: "Para onde os encarregados transferem. Alterar o IBAN exige 2FA.",
      done: s.hasBankIban,
      essential: false,
      detail: s.hasBankIban ? "IBAN registado." : "Sem IBAN.",
      action: { type: "panel", panel: "financeiro" },
      actionLabel: "Registar IBAN",
    },
    {
      id: "2fa",
      group: "Equipa",
      title: "Verificação em duas etapas (2FA)",
      description:
        "Obrigatória para pagamentos, IBAN, folha salarial e para dar cargos de Administrador ou Tesouraria.",
      done: s.adminHasTwoFactor,
      essential: true,
      detail: s.adminHasTwoFactor ? "Sessão com 2FA." : "Esta sessão não tem 2FA.",
      action: { type: "route", to: "/perfil" },
      actionLabel: "Activar 2FA",
    },
    {
      id: "equipa",
      group: "Equipa",
      title: "Equipa da escola",
      description: "Convide a Secretaria, a Tesouraria e os professores, cada um com o seu cargo.",
      done: s.otherActiveMembers > 0,
      essential: false,
      detail: s.otherActiveMembers
        ? `${plural(s.otherActiveMembers, "membro activo", "membros activos")} além de si.`
        : "Só a sua conta tem acesso.",
      action: { type: "route", to: "/acessos" },
      actionLabel: "Convidar equipa",
    },
    {
      id: "matricula",
      group: "Arranque",
      title: "Matrícula pública",
      description: "Link para os encarregados enviarem candidaturas; a secretaria confirma.",
      done: s.enrollmentFormOpen,
      essential: false,
      detail: s.enrollmentFormOpen ? "Link aberto." : "Link fechado.",
      action: { type: "panel", panel: "matricula" },
      actionLabel: "Configurar matrícula",
    },
    {
      id: "alunos",
      group: "Arranque",
      title: "Alunos",
      description: "Matricule um a um ou importe a lista existente (Excel) de uma vez.",
      done: s.students > 0,
      essential: false,
      detail: s.students ? `${plural(s.students, "aluno", "alunos")} registados.` : "Sem alunos.",
      action: { type: "route", to: "/importar" },
      actionLabel: "Importar alunos",
    },
  ];
}

export function summarizeSetup(steps: SetupStep[]) {
  const done = steps.filter((step) => step.done).length;
  const essentials = steps.filter((step) => step.essential);
  const essentialsDone = essentials.filter((step) => step.done).length;
  return {
    done,
    total: steps.length,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 100,
    essentialsDone,
    essentialsTotal: essentials.length,
    /** Pronta a operar: todos os essenciais feitos. */
    ready: essentialsDone === essentials.length,
    nextStep: steps.find((step) => step.essential && !step.done) ?? steps.find((s) => !s.done),
  };
}
