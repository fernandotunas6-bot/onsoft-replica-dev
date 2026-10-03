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
  /** Níveis de ensino escolhidos (Definições → Pedagógico ou registo). */
  teachingLevels: string[];
  /** Classes do plano desses níveis que ainda não existem. */
  pendingStructureGrades: number;
  /** Ensino Superior (só quando a escola o lecciona). */
  higherEd?: {
    regulationConfigured: boolean;
    programs: number;
    programsWithPlan: number;
  };
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
  | { type: "panel"; panel: string }
  | { type: "route"; to: string; search?: Record<string, string> }
  /** Cria no próprio assistente as classes, cursos e disciplinas em falta. */
  | { type: "apply-structure" };

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

import { isHigherEdOnly, periodModelFor } from "@/features/academic/period-model";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSetupSteps(s: SchoolSetupSnapshot): SetupStep[] {
  const missingSchoolFields = [
    !s.school.nif && "NIF",
    !s.school.phone && "telefone",
    !s.school.email && "e-mail",
    !s.school.address && "morada",
  ].filter(Boolean) as string[];

  const periods = periodModelFor(s.teachingLevels);
  const higherOnly = isHigherEdOnly(s.teachingLevels);

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
      title: `Períodos (${periods.plural.toLowerCase()})`,
      description:
        periods.kind === "semestre"
          ? "Datas do 1.º e do 2.º semestre: as cadeiras do plano e as épocas de exame seguem-nos."
          : "Datas de cada período. A pauta anual só fica completa com nota em todos os períodos.",
      done: s.termsInActiveYear >= periods.count,
      essential: true,
      detail: s.activeYearName
        ? s.termsInActiveYear
          ? `${plural(s.termsInActiveYear, "período", "períodos")} no ano activo${s.termsInActiveYear < periods.count ? ` — normalmente são ${periods.count}.` : "."}`
          : "Nenhum período criado."
        : "Defina primeiro o ano lectivo.",
      action: { type: "route", to: "/calendario" },
      actionLabel: "Abrir calendário",
    },
    {
      id: "niveis",
      group: "Ensino",
      title: "Níveis de ensino e cursos",
      description:
        "Que níveis a escola lecciona (Iniciação, Primário, I e II Ciclo, Superior) e os cursos do II Ciclo. Daqui saem as classes e disciplinas.",
      done: s.teachingLevels.length > 0,
      essential: true,
      detail: s.teachingLevels.length
        ? `${plural(s.teachingLevels.length, "nível escolhido", "níveis escolhidos")}.`
        : "Nenhum nível escolhido.",
      action: { type: "panel", panel: "pedagogico" },
      actionLabel: "Escolher níveis",
    },
    {
      id: "classes",
      group: "Ensino",
      title: higherOnly ? "Cursos e anos curriculares" : "Classes, cursos e disciplinas",
      description: higherOnly
        ? "A Licenciatura de partida com os anos 1.º a 5.º; os restantes cursos criam-se em Ensino Superior."
        : "Criados a partir dos níveis escolhidos; só se acrescenta o que falta.",
      done: s.gradeLevels > 0 && s.pendingStructureGrades === 0,
      essential: true,
      detail: !s.teachingLevels.length
        ? s.gradeLevels
          ? `${plural(s.gradeLevels, "classe", "classes")}. Escolha os níveis para completar a estrutura.`
          : "Escolha primeiro os níveis de ensino."
        : s.pendingStructureGrades
          ? `Faltam ${plural(s.pendingStructureGrades, "classe", "classes")} dos níveis escolhidos.`
          : `${plural(s.gradeLevels, "classe", "classes")} criadas.`,
      action:
        s.teachingLevels.length && s.pendingStructureGrades
          ? { type: "apply-structure" }
          : { type: "route", to: "/pedagogica", search: { tab: "estrutura" } },
      actionLabel:
        s.teachingLevels.length && s.pendingStructureGrades
          ? "Criar classes e disciplinas"
          : "Abrir estrutura",
    },
    {
      id: "estrutura",
      group: "Ensino",
      title: "Turmas do ano lectivo",
      description: "Quantas turmas por classe e em que turno — decisão da escola.",
      done: s.classGroupsInActiveYear > 0,
      essential: true,
      detail: !s.activeYearName
        ? "Defina primeiro o ano lectivo."
        : s.classGroupsInActiveYear
          ? `${plural(s.classGroupsInActiveYear, "turma", "turmas")} no ano activo.`
          : "Nenhuma turma no ano activo.",
      action: { type: "route", to: "/pedagogica", search: { tab: "turmas" } },
      actionLabel: "Abrir turmas",
    },
    {
      id: "disciplinas",
      group: "Ensino",
      title: higherOnly ? "Cadeiras por turma" : "Disciplinas por turma",
      description: higherOnly
        ? "Que cadeiras cada turma tem e quem as lecciona — é isso que dá ao docente a pauta da cadeira."
        : "Que disciplinas cada turma tem — base das cadernetas, pautas e horários.",
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
    ...(s.higherEd
      ? ([
          {
            id: "superior-regulamento",
            group: "Ensino",
            title: "Regulamento do Ensino Superior",
            description:
              "Créditos por ano e semestre, admissão e dispensa de exame, épocas, faltas e tentativas — as regras da instituição.",
            done: s.higherEd.regulationConfigured,
            essential: true,
            detail: s.higherEd.regulationConfigured
              ? "Regulamento guardado."
              : "Ainda com os valores de partida — confirme-os.",
            action: { type: "route", to: "/pedagogica/superior" },
            actionLabel: "Rever regulamento",
          },
          {
            id: "superior-planos",
            group: "Ensino",
            title: "Planos curriculares dos cursos",
            description:
              "Para cada curso: cadeiras por semestre, créditos e precedências. Sem plano não há inscrições por cadeira.",
            done: s.higherEd.programs > 0 && s.higherEd.programsWithPlan >= s.higherEd.programs,
            essential: true,
            detail: s.higherEd.programs
              ? `${s.higherEd.programsWithPlan} de ${plural(s.higherEd.programs, "curso", "cursos")} com plano.`
              : "Sem cursos do Ensino Superior. Crie a estrutura a partir dos níveis.",
            action: { type: "route", to: "/pedagogica/superior" },
            actionLabel: "Abrir planos",
          },
        ] satisfies SetupStep[])
      : []),
    // O ensino geral avalia por MAC/NPP/NPT; o Superior pelo regulamento (passo acima).
    ...(higherOnly
      ? []
      : ([
          {
            id: "avaliacao",
            group: "Ensino",
            title: "Regras de avaliação",
            description:
              "Pesos MAC/NPP/NPT, nota mínima e limite de faltas — usados em todas as pautas.",
            done: s.hasActiveAssessmentRule,
            essential: true,
            detail: s.hasActiveAssessmentRule
              ? "Modelo de avaliação activo."
              : "Sem modelo activo: as pautas não se calculam.",
            action: { type: "route", to: "/pedagogica", search: { tab: "modelos" } },
            actionLabel: "Abrir modelos de avaliação",
          },
        ] satisfies SetupStep[])),
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
      title: higherOnly ? "Estudantes" : "Alunos",
      description: "Matricule um a um ou importe a lista existente (Excel) de uma vez.",
      done: s.students > 0,
      essential: false,
      detail: s.students
        ? `${plural(s.students, higherOnly ? "estudante" : "aluno", higherOnly ? "estudantes" : "alunos")} registados.`
        : higherOnly
          ? "Sem estudantes."
          : "Sem alunos.",
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
