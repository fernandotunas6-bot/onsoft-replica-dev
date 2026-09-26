/**
 * Arquitectura académica do SIGA: os 16 módulos do ano lectivo e, para cada
 * um, onde a informação nasce, quem a altera, a que entidade pertence, como é
 * usada, como é validada e para onde segue. Fonte única para o separador
 * "Estrutura académica" em Pedagógica (e para a documentação).
 *
 * Regra de ouro: cada informação nasce no módulo certo; nenhum limiar
 * normativo fica no código — vem do modelo/regra de avaliação da escola.
 */

export type ModuleStage = "estrutura" | "pessoas" | "avaliacao" | "resultado";

export type ModuleLink =
  { kind: "tab"; tab: string; label: string } | { kind: "path"; to: string; label: string };

export type AcademicModule = {
  id: string;
  number: number;
  title: string;
  stage: ModuleStage;
  /** Onde a informação é criada. */
  createdIn: ModuleLink;
  /** Quem pode criar/alterar. */
  owners: string;
  /** Entidade (tabela) a que pertence. */
  entity: string;
  /** Como é usada a seguir. */
  usedBy: string;
  /** Como é validada antes de seguir. */
  validation: string;
  /** Para onde segue. */
  destination: string;
  /** Ainda não existe na aplicação: aparece como "por activar". */
  planned?: boolean;
};

export const STAGE_LABELS: Record<ModuleStage, string> = {
  estrutura: "Estrutura do ano",
  pessoas: "Turmas e pessoas",
  avaliacao: "Avaliação",
  resultado: "Resultado e registo",
};

export const ACADEMIC_MODULES: AcademicModule[] = [
  {
    id: "configuracao",
    number: 1,
    title: "Configuração académica",
    stage: "estrutura",
    createdIn: { kind: "path", to: "/calendario", label: "Calendário lectivo" },
    owners: "Administrador",
    entity: "academic_years · assessment_rule_sets",
    usedBy: "Todos os módulos do ano: períodos, regras de cálculo e prazos",
    validation: "Um só ano activo; regra de avaliação publicada (versão)",
    destination: "Períodos lectivos e motor de cálculo",
  },
  {
    id: "curriculo",
    number: 2,
    title: "Currículo",
    stage: "estrutura",
    createdIn: { kind: "tab", tab: "curriculo", label: "Currículo & Turnos" },
    owners: "Administrador, Secretaria",
    entity: "curricula · curriculum_areas · curriculum_subjects",
    usedBy: "Disciplinas de cada classe/curso e carga horária",
    validation: "Disciplina com área, classe e carga horária",
    destination: "Disciplinas das turmas",
  },
  {
    id: "periodos",
    number: 3,
    title: "Períodos lectivos",
    stage: "estrutura",
    createdIn: { kind: "path", to: "/calendario", label: "Calendário lectivo" },
    owners: "Administrador",
    entity: "terms",
    usedBy: "Diários de notas, pautas e prazos de lançamento",
    validation: "Datas dentro do ano, sem sobreposição; trimestral ou semestral por modelo",
    destination: "Avaliações e pautas de cada período",
  },
  {
    id: "turmas",
    number: 4,
    title: "Turmas",
    stage: "pessoas",
    createdIn: { kind: "tab", tab: "turmas", label: "Turmas" },
    owners: "Administrador, Secretaria",
    entity: "class_groups",
    usedBy: "Matrículas, horários, diários e pautas",
    validation: "Classe, turno e capacidade; ano lectivo obrigatório",
    destination: "Matrícula e atribuição de disciplinas",
  },
  {
    id: "disciplinas",
    number: 5,
    title: "Disciplinas",
    stage: "pessoas",
    createdIn: { kind: "tab", tab: "disciplinas", label: "Disciplinas" },
    owners: "Administrador, Secretaria",
    entity: "subjects · class_subjects",
    usedBy: "Horário, avaliações e diário por turma",
    validation: "Disciplina do currículo da classe; sem duplicar na turma",
    destination: "Atribuição do professor",
  },
  {
    id: "professores",
    number: 6,
    title: "Atribuição de professores",
    stage: "pessoas",
    createdIn: { kind: "tab", tab: "turmas", label: "Turmas → disciplinas" },
    owners: "Administrador, Secretaria",
    entity: "class_subjects.teacher_id",
    usedBy: "Define onde o professor pode lançar notas e dar aulas",
    validation: "Professor activo; a base recusa notas fora da sua atribuição",
    destination: "Horário e lançamento de notas",
  },
  {
    id: "alunos",
    number: 7,
    title: "Matrícula dos alunos",
    stage: "pessoas",
    createdIn: { kind: "path", to: "/alunos", label: "Alunos" },
    owners: "Secretaria",
    entity: "enrollments",
    usedBy: "Vínculo do aluno à turma no ano: notas, presenças, pauta",
    validation: "Capacidade da turma e 2FA de quem matricula",
    destination: "Diários e pautas da turma",
  },
  {
    id: "avaliacoes",
    number: 8,
    title: "Avaliações",
    stage: "avaliacao",
    createdIn: { kind: "tab", tab: "notas", label: "Notas → avaliações" },
    owners: "Professor da disciplina, Coordenação",
    entity: "siga_assessment_items",
    usedBy: "Provas e trabalhos do período, com data e componente (MAC, NPP, NPT)",
    validation: "Só na turma/disciplina atribuída; alunos avisados da data",
    destination: "Lançamento de notas",
  },
  {
    id: "notas",
    number: 9,
    title: "Lançamento de notas",
    stage: "avaliacao",
    createdIn: { kind: "tab", tab: "notas", label: "Notas" },
    owners: "Professor da disciplina",
    entity: "gradebooks · grade_items · grade_scores",
    usedBy: "Componentes MAC, NPP e NPT de cada aluno",
    validation: "Escala 0–20; alteração depois do fecho só por pedido aprovado",
    destination: "Motor de cálculo",
  },
  {
    id: "medias",
    number: 10,
    title: "Médias (motor de cálculo)",
    stage: "avaliacao",
    createdIn: { kind: "tab", tab: "modelos", label: "Modelos de avaliação" },
    owners: "Ninguém edita: o motor calcula pela regra (Administrador publica a regra)",
    entity: "Regra de avaliação activa (Decreto Executivo 424/25 por omissão)",
    usedBy: "MT pelos pesos da regra (MAC 50% + NPT 50% por omissão); MFD = média dos períodos",
    validation: "Arredondamento e nota de aprovação da regra da escola",
    destination: "Pré-pauta",
  },
  {
    id: "pautas",
    number: 11,
    title: "Pautas",
    stage: "avaliacao",
    createdIn: { kind: "tab", tab: "pautas", label: "Pautas" },
    owners: "Professor submete · Coordenação valida e publica",
    entity: "grade_sheets · grade_sheet_rows",
    usedBy: "Rascunho → submetida → em validação → homologada → publicada → fechada",
    validation: "Pré-pauta sem notas em falta nem alterações pendentes",
    destination: "Resultado final; publicada fica bloqueada",
  },
  {
    id: "recuperacao",
    number: 12,
    title: "Recuperação",
    stage: "resultado",
    createdIn: { kind: "tab", tab: "exames", label: "Exames" },
    owners: "Secretaria e coordenação",
    entity: "siga_exam_registrations (elegibilidade, inscrição, nota)",
    usedBy: "Nova oportunidade para quem não atingiu a aprovação",
    validation: "Elegibilidade pela pauta anual homologada e pelos limites da época",
    destination: "Motor de resultado",
  },
  {
    id: "exames",
    number: 13,
    title: "Exames",
    stage: "resultado",
    createdIn: { kind: "tab", tab: "exames", label: "Exames" },
    owners: "Secretaria e coordenação, júri",
    entity: "siga_exam_sessions (época, datas, acesso, método de cálculo)",
    usedBy: "Recurso, exame especial, exame final e melhoria por disciplina",
    validation: "Escala da escola; média final calculada pelo servidor",
    destination: "Resultado final",
  },
  {
    id: "resultado",
    number: 14,
    title: "Resultado final",
    stage: "resultado",
    createdIn: { kind: "tab", tab: "pautas", label: "Pauta final" },
    owners: "Calculado; homologado pela direcção",
    entity: "grade_sheets (final) · student_academic_history",
    usedBy: "Situação do aluno no ano, pelas regras do modelo",
    validation: "Sem pendências; pauta final homologada",
    destination: "Histórico académico e documentos",
  },
  {
    id: "historico",
    number: 15,
    title: "Histórico académico",
    stage: "resultado",
    createdIn: { kind: "path", to: "/alunos", label: "Ficha do aluno" },
    owners: "Secretaria (só registos oficiais)",
    entity: "student_academic_history",
    usedBy: "Percurso por ano: classe, média, resultado; declarações e certificados",
    validation: "Registo por ano, a partir do resultado homologado",
    destination: "Documentos oficiais",
  },
  {
    id: "auditoria",
    number: 16,
    title: "Auditoria",
    stage: "resultado",
    createdIn: { kind: "path", to: "/configuracoes", label: "Registos da base" },
    owners: "Automático (só leitura)",
    entity: "audit_logs",
    usedBy: "Quem, quando, o quê, antes e depois de cada nota e avaliação",
    validation: "Escrito pela base em cada alteração; ninguém o edita",
    destination: "Consulta da direcção e inspecção",
  },
];

/** Percurso da informação, do modelo ao histórico. */
export const ACADEMIC_PIPELINE = [
  "Modelo académico",
  "Regras",
  "Currículo",
  "Matrícula / turma",
  "Avaliações",
  "Lançamento de notas",
  "Motor de cálculo",
  "Validação / pauta",
  "Recuperação / exames",
  "Resultado final",
  "Histórico oficial",
];

export type ModuleStatus = "ready" | "partial" | "missing" | "planned" | "automatic";

export type AcademicStructureCounts = {
  yearName: string | null;
  yearActive: boolean;
  activeRuleSets: number;
  subjects: number;
  terms: number;
  classGroups: number;
  classSubjects: number;
  classSubjectsWithTeacher: number;
  enrollments: number;
  assessments: number;
  gradebooks: Record<string, number>;
  gradeSheets: Record<string, number>;
  pendingGradeChanges: number;
  historyRecords: number;
  auditEvents30d: number;
  /** Épocas de exame do ano (0 se a migração ainda não estiver aplicada). */
  examSessions?: number;
  /** Inscrições activas nessas épocas. */
  examRegistrations?: number;
};

export type ModuleSnapshot = { status: ModuleStatus; metric: string };

const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Estado de cada módulo a partir das contagens reais do ano. */
export function moduleSnapshot(module: AcademicModule, c: AcademicStructureCounts): ModuleSnapshot {
  if (module.planned) return { status: "planned", metric: "Por activar" };
  switch (module.id) {
    case "configuracao":
      if (!c.yearName) return { status: "missing", metric: "Sem ano lectivo" };
      return c.activeRuleSets > 0 && c.yearActive
        ? { status: "ready", metric: `${c.yearName} · regra activa` }
        : {
            status: "partial",
            metric: c.activeRuleSets ? c.yearName : "Sem regra de avaliação activa",
          };
    case "curriculo":
      return c.subjects > 0
        ? { status: "ready", metric: plural(c.subjects, "disciplina", "disciplinas") }
        : { status: "missing", metric: "Sem disciplinas" };
    case "periodos":
      return c.terms >= 2
        ? { status: "ready", metric: plural(c.terms, "período", "períodos") }
        : c.terms === 1
          ? { status: "partial", metric: "1 período" }
          : { status: "missing", metric: "Sem períodos" };
    case "turmas":
      return c.classGroups > 0
        ? { status: "ready", metric: plural(c.classGroups, "turma", "turmas") }
        : { status: "missing", metric: "Sem turmas" };
    case "disciplinas":
      return c.classSubjects > 0
        ? {
            status: "ready",
            metric: plural(c.classSubjects, "disciplina atribuída", "disciplinas atribuídas"),
          }
        : { status: "missing", metric: "Nenhuma disciplina nas turmas" };
    case "professores": {
      if (!c.classSubjects) return { status: "missing", metric: "Sem disciplinas por atribuir" };
      const without = c.classSubjects - c.classSubjectsWithTeacher;
      return without === 0
        ? { status: "ready", metric: "Todas com professor" }
        : { status: "partial", metric: `${without} sem professor` };
    }
    case "alunos":
      return c.enrollments > 0
        ? { status: "ready", metric: plural(c.enrollments, "matrícula", "matrículas") }
        : { status: "missing", metric: "Sem matrículas" };
    case "avaliacoes":
      return c.assessments > 0
        ? { status: "ready", metric: plural(c.assessments, "avaliação", "avaliações") }
        : { status: "partial", metric: "Nenhuma avaliação marcada" };
    case "notas": {
      const total = sum(c.gradebooks);
      if (!total) return { status: "partial", metric: "Nenhum diário aberto" };
      const closed = c.gradebooks["closed"] ?? 0;
      return {
        status: closed === total ? "ready" : "partial",
        metric: `${plural(total, "diário", "diários")} · ${closed} fechados`,
      };
    }
    case "medias":
      return { status: "automatic", metric: "Calculadas pelo motor" };
    case "pautas": {
      const total = sum(c.gradeSheets);
      if (!total) return { status: "partial", metric: "Nenhuma pauta gerada" };
      const done = (c.gradeSheets["published"] ?? 0) + (c.gradeSheets["closed"] ?? 0);
      return {
        status: done === total ? "ready" : "partial",
        metric: `${plural(total, "pauta", "pautas")} · ${done} publicadas`,
      };
    }
    case "recuperacao":
      return (c.examRegistrations ?? 0) > 0
        ? { status: "ready", metric: plural(c.examRegistrations ?? 0, "inscrição", "inscrições") }
        : { status: "partial", metric: "Sem inscrições em exame" };
    case "exames":
      return (c.examSessions ?? 0) > 0
        ? { status: "ready", metric: plural(c.examSessions ?? 0, "época", "épocas") }
        : { status: "partial", metric: "Sem épocas de exame" };
    case "resultado":
      return (c.gradeSheets["closed"] ?? 0) > 0
        ? { status: "ready", metric: "Pautas finais fechadas" }
        : { status: "partial", metric: "Aguarda pautas fechadas" };
    case "historico":
      return c.historyRecords > 0
        ? { status: "ready", metric: plural(c.historyRecords, "registo", "registos") }
        : { status: "partial", metric: "Sem registos" };
    case "auditoria":
      return {
        status: "automatic",
        metric:
          c.pendingGradeChanges > 0
            ? `${plural(c.pendingGradeChanges, "alteração pendente", "alterações pendentes")}`
            : `${c.auditEvents30d} eventos em 30 dias`,
      };
    default:
      return { status: "partial", metric: "" };
  }
}

export const STATUS_LABELS: Record<ModuleStatus, string> = {
  ready: "Configurado",
  partial: "Em curso",
  missing: "Em falta",
  planned: "Por activar",
  automatic: "Automático",
};
