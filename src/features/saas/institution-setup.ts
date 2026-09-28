/**
 * Lista da configuração inicial, a partir de factos simples sobre a escola.
 * Função pura (testada à parte); o servidor só conta linhas.
 *
 * "Essencial" é o que o dia-a-dia precisa para lançar notas e matrículas;
 * o resto pode ficar para depois da criação e da aprovação da escola.
 */
export type SetupFacts = {
  teachingLevels: string[];
  hasActiveYear: boolean;
  terms: number;
  hasLocation: boolean;
  hasLogo: boolean;
  rooms: number;
  shifts: number;
  classGroups: number;
  feePlans: number;
  staff: number;
  students: number;
};

export type SetupItem = {
  id:
    | "ensino"
    | "periodos"
    | "turnos"
    | "salas"
    | "turmas"
    | "localizacao"
    | "logotipo"
    | "propinas"
    | "equipa"
    | "alunos";
  title: string;
  detail: string;
  done: boolean;
  essential: boolean;
  /** Rota interna do SIGA onde se resolve. */
  href: string;
  search?: Record<string, string>;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function setupChecklist(facts: SetupFacts): SetupItem[] {
  return [
    {
      id: "ensino",
      title: "Ensino oferecido",
      detail: facts.teachingLevels.length
        ? plural(facts.teachingLevels.length, "nível escolhido", "níveis escolhidos")
        : "Escolha os níveis: cria as classes e as disciplinas.",
      done: facts.teachingLevels.length > 0,
      essential: true,
      href: "/configuracoes/inicial",
    },
    {
      id: "periodos",
      title: "Ano lectivo e períodos",
      detail: !facts.hasActiveYear
        ? "Sem ano lectivo activo."
        : facts.terms
          ? plural(facts.terms, "período", "períodos")
          : "O ano lectivo ainda não tem períodos.",
      done: facts.hasActiveYear && facts.terms > 0,
      essential: true,
      href: "/pedagogica",
      search: { tab: "estrutura" },
    },
    {
      id: "turmas",
      title: "Turmas",
      detail: facts.classGroups
        ? plural(facts.classGroups, "turma", "turmas")
        : "Crie as turmas do ano ou importe-as.",
      done: facts.classGroups > 0,
      essential: true,
      href: "/pedagogica",
      search: { tab: "turmas" },
    },
    {
      id: "turnos",
      title: "Turnos",
      detail: facts.shifts ? plural(facts.shifts, "turno", "turnos") : "Manhã, tarde, noite.",
      done: facts.shifts > 0,
      essential: false,
      href: "/pedagogica",
      search: { tab: "horarios" },
    },
    {
      id: "salas",
      title: "Salas",
      detail: facts.rooms ? plural(facts.rooms, "sala", "salas") : "Precisas para o horário.",
      done: facts.rooms > 0,
      essential: false,
      href: "/pedagogica",
      search: { tab: "salas" },
    },
    {
      id: "localizacao",
      title: "Localização",
      detail: facts.hasLocation ? "Província e município" : "Aparece nos documentos oficiais.",
      done: facts.hasLocation,
      essential: false,
      href: "/configuracoes",
      search: { painel: "escola" },
    },
    {
      id: "logotipo",
      title: "Logótipo",
      detail: facts.hasLogo ? "Carregado" : "Para declarações, pautas e o portal.",
      done: facts.hasLogo,
      essential: false,
      href: "/configuracoes",
      search: { painel: "identidade" },
    },
    {
      id: "propinas",
      title: "Propinas",
      detail: facts.feePlans ? plural(facts.feePlans, "plano", "planos") : "Valores e prazos.",
      done: facts.feePlans > 0,
      essential: false,
      href: "/configuracoes",
      search: { painel: "financeiro" },
    },
    {
      id: "equipa",
      title: "Equipa",
      detail:
        facts.staff > 1
          ? plural(facts.staff, "pessoa com acesso", "pessoas com acesso")
          : "Convide a secretaria, a tesouraria e os professores.",
      done: facts.staff > 1,
      essential: false,
      href: "/acessos",
    },
    {
      id: "alunos",
      title: "Alunos",
      detail: facts.students
        ? plural(facts.students, "aluno", "alunos")
        : "Matricule ou importe de uma folha.",
      done: facts.students > 0,
      essential: false,
      href: "/importar",
      search: { tab: "novo", modulo: "alunos" },
    },
  ];
}

export function setupProgress(items: SetupItem[]) {
  const done = items.filter((item) => item.done).length;
  const essentialLeft = items.filter((item) => item.essential && !item.done).length;
  return { done, total: items.length, essentialLeft };
}
