/**
 * Catálogo único de ferramentas contextuais do perfil docente.
 * Só contém destinos reais do SIGA Plus; a navegação e o servidor mantêm
 * autorização própria. Nunca inferir atribuições de uma escola mista.
 */
export const teacherToolCatalog = [
  { id: "aulas", label: "Aulas de hoje", detail: "Agenda, chamada e execução registada", group: "Lectivo", visibility: "staff", path: "/professores" },
  { id: "horario", label: "Horário semanal", detail: "Tempos, turmas e salas", group: "Lectivo", visibility: "staff", path: "/pedagogica" },
  { id: "turmas", label: "Turmas e alunos", detail: "Cursos, classes e grupos atribuídos", group: "Lectivo", visibility: "staff", path: "/professores" },
  { id: "planos", label: "Planos de aula", detail: "Planificação, conteúdos e actividade prevista", group: "Lectivo", visibility: "staff", path: "/planos-aula" },
  { id: "notas", label: "Notas e avaliações", detail: "Lançamentos no motor pedagógico", group: "Avaliação", visibility: "staff", path: "/pedagogica" },
  { id: "trabalhos", label: "Trabalhos e projectos", detail: "Tarefas da turma e entregas", group: "Avaliação", visibility: "staff", path: "/pedagogica/trabalhos" },
  { id: "pautas", label: "Pautas e resultados", detail: "Consulta e revisão autorizada", group: "Avaliação", visibility: "staff", path: "/pedagogica" },
  { id: "exames", label: "Exames e provas", detail: "Avaliações e épocas aplicáveis", group: "Avaliação", visibility: "staff", path: "/pedagogica" },
  { id: "competencias", label: "Competências e progresso", detail: "Acompanhamento pedagógico", group: "Avaliação", visibility: "staff", path: "/pedagogica" },
  { id: "risco", label: "Acompanhamento dos alunos", detail: "Alertas e intervenções autorizadas", group: "Avaliação", visibility: "staff", path: "/pedagogica/risco" },
  { id: "materiais", label: "Materiais e arquivos", detail: "Ficheiros e recursos da escola", group: "Recursos", visibility: "staff", path: "/arquivos" },
  { id: "virtuais", label: "Aulas virtuais", detail: "Sessões online e calendário", group: "Recursos", visibility: "staff", path: "/aulas-virtuais" },
  { id: "calendario", label: "Calendário lectivo", detail: "Períodos, eventos e feriados", group: "Recursos", visibility: "staff", path: "/calendario" },
  { id: "comunicacoes", label: "Comunicações", detail: "Comunicados institucionais", group: "Recursos", visibility: "staff", path: "/comunicacoes" },
  { id: "documentos", label: "Documentos pessoais", detail: "Certificados, BI e exigências da escola", group: "Carreira", visibility: "staff", path: "/professores" },
  { id: "identidade", label: "Cadastro e contactos", detail: "Ficha única, relações e histórico pessoal", group: "Carreira", visibility: "manager", path: "/pessoas" },
  { id: "contratos", label: "Contrato e cargo", detail: "Vínculo, funções e condições", group: "Carreira", visibility: "hr", path: "/financeiro/rh" },
  { id: "vencimentos", label: "Salário e folhas", detail: "Vencimentos e histórico de processamento", group: "Carreira", visibility: "hr", path: "/financeiro/rh" },
  { id: "faltas", label: "Ausências e licenças", detail: "Faltas e validação pelo RH", group: "Carreira", visibility: "hr", path: "/financeiro/rh/faltas" },
  { id: "historico", label: "Histórico profissional", detail: "Atribuições e histórico disponível", group: "Carreira", visibility: "staff", path: "/professores" },
  { id: "superior_pautas", label: "Pautas por cadeira", detail: "Frequências, exames e épocas", group: "Ensino Superior", visibility: "staff", path: "/pedagogica/pautas-superior", level: "superior" },
  { id: "superior_planos", label: "Planos e créditos", detail: "Semestres, precedências e unidades curriculares", group: "Ensino Superior", visibility: "manager", path: "/pedagogica/superior", level: "superior" },
] as const;
export type TeacherToolId = (typeof teacherToolCatalog)[number]["id"];
export type TeacherTool = (typeof teacherToolCatalog)[number];
export type TeacherContextGroup = TeacherTool["group"];

type TeacherToolContext = {
  assignedLevels: readonly string[];
  schoolLevels: readonly string[];
  isSelf: boolean;
  canManage: boolean;
  canReadHr: boolean;
  /** Recheck access permissions for every destination (navigation never elevates access). */
  canOpen: (pathname: string) => boolean;
};

/**
 * Identical tool visibility for desktop and mobile. Neither a mixed school
 * nor the legal nature of a school grants Higher Education responsibilities.
 */
export function availableTeacherTools(context: TeacherToolContext): TeacherTool[] {
  const permitted = context.isSelf || context.canManage;
  if (!permitted) return [];
  const effectiveLevels = context.assignedLevels.length
    ? context.assignedLevels
    : context.schoolLevels.length === 1 ? context.schoolLevels : [];
  return teacherToolCatalog.filter((tool) => {
    if (tool.visibility === "manager" && !context.canManage) return false;
    if (tool.visibility === "hr" && !context.canReadHr) return false;
    if ("level" in tool && !effectiveLevels.includes(tool.level)) return false;
    return context.canOpen(tool.path);
  });
}
