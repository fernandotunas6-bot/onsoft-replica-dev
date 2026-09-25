import { moduleIcons } from "@/lib/app-icons";
import type { ApplicationRole } from "@/features/auth/access-policy";
import type { Plan } from "@/features/saas/types";
import { canAccessPath } from "@/features/auth/access-policy";

export type PortalMode = "student" | "guardian" | "teacher" | "admin";

export function resolvePortalMode(role: ApplicationRole): PortalMode {
  if (role === "Aluno") return "student";
  if (role === "Encarregado") return "guardian";
  if (role === "Professor") return "teacher";
  return "admin";
}

export type NavChild = {
  label: string;
  icon: React.ElementType;
  to: string;
  search?: Record<string, string | undefined>;
};

export type NavItem = {
  label: string;
  icon: React.ElementType;
  to?: string;
  search?: Record<string, string | undefined>;
  children?: NavChild[];
};

export type NavGroup = { title: string; items: NavItem[] };

/**
 * Um sub-item da barra lateral só está activo quando o caminho **e** os
 * parâmetros de pesquisa que ele fixa coincidem com a localização actual.
 *
 * Comparar apenas `to` marcava as quatro entradas de "Área Pedagógica" como
 * activas ao mesmo tempo: todas apontam para `/pedagogica` e distinguem-se só
 * pelo `?tab=` (turmas, notas, horarios, chamada). Ficavam as quatro com o
 * fundo de item activo, sem dizer ao utilizador em que separador está.
 */
/**
 * Funde os menus a abrir com os já abertos, devolvendo **a mesma referência**
 * quando não há nada a acrescentar.
 *
 * Isto não é micro-optimização: a `AppSidebar` chama isto dentro de um
 * `useEffect` cuja dependência é derivada do papel/grants do utilizador. Se
 * devolvesse sempre um array novo, o `setState` mudava de identidade, o
 * componente voltava a renderizar, a dependência voltava a mudar e a barra
 * lateral entrava em ciclo infinito de render — a montar a barra num teste, o
 * processo ficava pendurado sem nunca terminar. Devolver `prev` faz o React
 * desistir da actualização e quebra o ciclo mesmo que a dependência acima seja
 * instável.
 */
export function mergeOpenMenus(prev: string[], parents: string[]): string[] {
  if (parents.every((label) => prev.includes(label))) return prev;
  return Array.from(new Set([...prev, ...parents]));
}

export function isNavChildActive(
  child: Pick<NavChild, "to" | "search">,
  pathname: string,
  search: Record<string, unknown> = {},
): boolean {
  if (child.to !== pathname) return false;
  return Object.entries(child.search ?? {}).every(
    ([key, value]) => value === undefined || search[key] === value,
  );
}

function filterNavGroups(
  groups: NavGroup[],
  role: ApplicationRole,
  grants: Record<string, string> = {},
  plan?: Plan | null,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => canAccessPath(child.to, role, grants, plan)),
        }))
        .filter(
          (item) =>
            (item.to ? canAccessPath(item.to, role, grants, plan) : false) ||
            Boolean(item.children?.length),
        ),
    }))
    .filter((group) => group.items.length > 0);
}

export function getPortalNavigation(
  role: ApplicationRole,
  grants: Record<string, string> = {},
  plan?: Plan | null,
): NavGroup[] {
  const mode = resolvePortalMode(role);

  if (mode === "student") {
    return filterNavGroups(
      [
        {
          title: "Portal do Aluno",
          items: [
            { label: "Início", icon: moduleIcons.dashboard, to: "/" },
            {
              label: "Académico",
              icon: moduleIcons.pedagogy,
              children: [
                {
                  label: "Minha Turma",
                  icon: moduleIcons.classes,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Horário",
                  icon: moduleIcons.schedule,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
                {
                  label: "Avaliações e Notas",
                  icon: moduleIcons.grades,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
              ],
            },
            { label: "Calendário Lectivo", icon: moduleIcons.calendar, to: "/calendario" },
            {
              label: "Frequência",
              icon: moduleIcons.attendance,
              to: "/pedagogica",
              search: { tab: "presencas" },
            },
            {
              label: "Financeiro",
              icon: moduleIcons.finance,
              to: "/financeiro",
            },
            { label: "Documentos", icon: moduleIcons.documents, to: "/documentos" },
            { label: "Comunicação", icon: moduleIcons.communications, to: "/comunicacoes" },
            { label: "Meu Portal Alumni", icon: moduleIcons.alumni, to: "/alumni/portal" },
            { label: "Meu Perfil", icon: moduleIcons.profile, to: "/perfil" },
          ],
        },
      ],
      role,
      grants,
      plan,
    );
  }

  if (mode === "guardian") {
    return filterNavGroups(
      [
        {
          title: "Portal do Encarregado",
          items: [
            { label: "Meu Educando", icon: moduleIcons.dashboard, to: "/" },
            {
              label: "Desempenho",
              icon: moduleIcons.academicReports,
              children: [
                {
                  label: "Notas e Boletim",
                  icon: moduleIcons.grades,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
                {
                  label: "Turma e Disciplinas",
                  icon: moduleIcons.classes,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Horário de Aulas",
                  icon: moduleIcons.schedule,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
              ],
            },
            { label: "Calendário Lectivo", icon: moduleIcons.calendar, to: "/calendario" },
            {
              label: "Frequência",
              icon: moduleIcons.attendance,
              to: "/pedagogica",
              search: { tab: "presencas" },
            },
            {
              label: "Financeiro",
              icon: moduleIcons.finance,
              children: [
                { label: "Propinas e Faturas", icon: moduleIcons.finance, to: "/financeiro" },
                { label: "Recibos", icon: moduleIcons.receipts, to: "/faturas" },
              ],
            },
            { label: "Documentos", icon: moduleIcons.documents, to: "/documentos" },
            { label: "Comunicação", icon: moduleIcons.communications, to: "/comunicacoes" },
            { label: "Meu Perfil", icon: moduleIcons.profile, to: "/perfil" },
          ],
        },
      ],
      role,
      grants,
      plan,
    );
  }

  if (mode === "teacher") {
    return filterNavGroups(
      [
        {
          title: "Portal do Professor",
          items: [
            { label: "Início", icon: moduleIcons.dashboard, to: "/" },
            {
              label: "Frequência",
              icon: moduleIcons.attendance,
              children: [
                {
                  label: "Fazer Chamada",
                  icon: moduleIcons.attendance,
                  to: "/pedagogica",
                  search: { tab: "chamada" },
                },
                {
                  label: "Histórico de Presenças",
                  icon: moduleIcons.attendance,
                  to: "/pedagogica",
                  search: { tab: "presencas" },
                },
                {
                  label: "Minha presença (QR)",
                  icon: moduleIcons.qrPresence,
                  to: "/professor/presenca",
                },
              ],
            },
            {
              label: "Ensino e Avaliações",
              icon: moduleIcons.pedagogy,
              children: [
                {
                  label: "Minhas Turmas",
                  icon: moduleIcons.classes,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Lançar Notas e Pautas",
                  icon: moduleIcons.grades,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
                {
                  label: "Horário de Aulas",
                  icon: moduleIcons.schedule,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
                { label: "Planos de Aula", icon: moduleIcons.lessonPlans, to: "/planos-aula" },
                { label: "Alunos em risco", icon: moduleIcons.grades, to: "/pedagogica/risco" },
              ],
            },
            { label: "Calendário Lectivo", icon: moduleIcons.calendar, to: "/calendario" },
            { label: "Biblioteca & Materiais", icon: moduleIcons.files, to: "/arquivos" },
            { label: "Comunicação", icon: moduleIcons.communications, to: "/comunicacoes" },
            { label: "Meu Perfil", icon: moduleIcons.profile, to: "/perfil" },
          ],
        },
      ],
      role,
      grants,
      plan,
    );
  }

  const groups: NavGroup[] = [
    {
      title: "Principal",
      items: [
        { label: "Início", icon: moduleIcons.dashboard, to: "/" },
        { label: "Calendário Lectivo", icon: moduleIcons.calendar, to: "/calendario" },
      ],
    },
    {
      title: "Académico",
      items: [
        {
          label: "Área Pedagógica",
          icon: moduleIcons.pedagogy,
          children: [
            {
              label: "Turmas e Disciplinas",
              icon: moduleIcons.classes,
              to: "/pedagogica",
              search: { tab: "turmas" },
            },
            {
              label: "Notas e Avaliações",
              icon: moduleIcons.grades,
              to: "/pedagogica",
              search: { tab: "notas" },
            },
            {
              label: "Horários",
              icon: moduleIcons.schedule,
              to: "/pedagogica",
              search: { tab: "horarios" },
            },
            {
              label: "Presenças e Chamada",
              icon: moduleIcons.attendance,
              to: "/pedagogica",
              search: { tab: "chamada" },
            },
            {
              label: "Planos de Aula",
              icon: moduleIcons.lessonPlans,
              to: "/planos-aula",
            },
            {
              label: "Alunos em risco",
              icon: moduleIcons.grades,
              to: "/pedagogica/risco",
            },
          ],
        },
      ],
    },
    {
      title: "Secretaria",
      items: [
        { label: "Pessoas", icon: moduleIcons.people, to: "/pessoas" },
        {
          label: "Importação de Dados",
          icon: moduleIcons.import,
          children: [
            {
              label: "Nova Importação",
              icon: moduleIcons.import,
              to: "/importar",
              search: { tab: "novo" },
            },
            {
              label: "Histórico & Auditoria",
              icon: moduleIcons.audit,
              to: "/importar",
              search: { tab: "historico" },
            },
            {
              label: "Modelos Oficiais Excel",
              icon: moduleIcons.officialTemplates,
              to: "/importar",
              search: { tab: "modelos" },
            },
          ],
        },
        {
          label: "Gestão de Alunos",
          icon: moduleIcons.students,
          children: [
            { label: "Lista de Alunos", icon: moduleIcons.students, to: "/alunos" },
            {
              label: "Matricular Aluno",
              icon: moduleIcons.enrollment,
              to: "/alunos",
              search: { action: "matricular" },
            },
            {
              label: "Confirmar Matrícula",
              icon: moduleIcons.enrollmentConfirm,
              to: "/alunos",
              search: { action: "confirmar" },
            },
            {
              label: "Estado do Aluno",
              icon: moduleIcons.students,
              to: "/alunos",
              search: { action: "estado" },
            },
            { label: "Alumni · Antigos Alunos", icon: moduleIcons.alumni, to: "/alumni" },
          ],
        },
        {
          label: "Documentos",
          icon: moduleIcons.documents,
          children: [
            { label: "Emissão de Documentos", icon: moduleIcons.documents, to: "/documentos" },
          ],
        },
        { label: "Biblioteca de Arquivos", icon: moduleIcons.files, to: "/arquivos" },
      ],
    },
    {
      title: "Financeiro",
      items: [
        {
          label: "Caixa e Pagamentos",
          icon: moduleIcons.finance,
          children: [
            { label: "Movimentos de Caixa", icon: moduleIcons.finance, to: "/financeiro" },
            { label: "Tesouraria", icon: moduleIcons.finance, to: "/tesouraria" },
            { label: "Faturas e Recibos", icon: moduleIcons.receipts, to: "/faturas" },
            { label: "RH e Folha Salarial", icon: moduleIcons.hr, to: "/financeiro/rh" },
            { label: "Processar Folha", icon: moduleIcons.hr, to: "/financeiro/rh/folha" },
            {
              label: "Ordens de Pagamento RH",
              icon: moduleIcons.payouts,
              to: "/financeiro/rh/pagamentos",
            },
            {
              label: "Faltas e Assiduidade",
              icon: moduleIcons.staffAbsences,
              to: "/financeiro/rh/faltas",
            },
            {
              label: "Validação de Presença",
              icon: moduleIcons.qrPresence,
              to: "/financeiro/rh/presenca",
            },
          ],
        },
      ],
    },
    {
      title: "Relatórios",
      items: [
        {
          label: "Relatórios Financeiros",
          icon: moduleIcons.financialReports,
          to: "/relatorios/financeiros",
        },
        {
          label: "Relatórios Académicos",
          icon: moduleIcons.academicReports,
          to: "/relatorios/academicos",
        },
      ],
    },
    {
      title: "Gestão e Comunicação",
      items: [
        { label: "Catracas & Cartão Virtual", icon: moduleIcons.accessCards, to: "/catracas" },
        { label: "Gestão de Acessos", icon: moduleIcons.access, to: "/acessos" },
        { label: "Comunicações", icon: moduleIcons.communications, to: "/comunicacoes" },
      ],
    },
    {
      title: "Sistema",
      items: [
        {
          label: "Definições",
          icon: moduleIcons.settings,
          children: [
            {
              label: "Escola e branding",
              icon: moduleIcons.school,
              to: "/configuracoes",
              search: { painel: "escola" },
            },
            {
              label: "Matrícula online",
              icon: moduleIcons.onlineEnrollment,
              to: "/configuracoes",
              search: { painel: "matricula" },
            },
            {
              label: "Integrações",
              icon: moduleIcons.integrations,
              to: "/configuracoes",
              search: { painel: "integracoes" },
            },
            {
              label: "Financeiro",
              icon: moduleIcons.finance,
              to: "/configuracoes",
              search: { painel: "financeiro" },
            },
            {
              label: "Segurança",
              icon: moduleIcons.security,
              to: "/configuracoes",
              search: { painel: "seguranca" },
            },
            {
              label: "Diagnóstico de erros",
              icon: moduleIcons.security,
              to: "/configuracoes/diagnostico",
            },
          ],
        },
        { label: "Meu Perfil", icon: moduleIcons.profile, to: "/perfil" },
      ],
    },
  ];

  return filterNavGroups(groups, role, grants, plan);
}

export function getPortalContextualSuggestions(role: ApplicationRole) {
  const mode = resolvePortalMode(role);

  if (mode === "teacher") {
    return [
      { label: "Fazer chamada", to: "/pedagogica", search: { tab: "chamada" } },
      { label: "Lançar notas", to: "/pedagogica", search: { tab: "notas" } },
      { label: "Ver avaliações", to: "/pedagogica", search: { tab: "notas" } },
      { label: "Planos de aula", to: "/planos-aula" },
      { label: "Horário de aulas", to: "/pedagogica", search: { tab: "horarios" } },
    ];
  }

  if (mode === "student") {
    return [
      { label: "Meu Portal Alumni", to: "/alumni/portal" },
      { label: "Notas e Boletim", to: "/pedagogica", search: { tab: "notas" } },
      { label: "Frequência", to: "/pedagogica", search: { tab: "presencas" } },
      { label: "Horário", to: "/pedagogica", search: { tab: "horarios" } },
      { label: "Propinas", to: "/financeiro" },
      { label: "Documentos", to: "/documentos" },
    ];
  }

  if (mode === "guardian") {
    return [
      { label: "Faltas e Presenças", to: "/pedagogica", search: { tab: "presencas" } },
      { label: "Notas e Avaliações", to: "/pedagogica", search: { tab: "notas" } },
      { label: "Propinas e Pagamentos", to: "/financeiro" },
      { label: "Avisos da Escola", to: "/comunicacoes" },
      { label: "Contactar a Escola", to: "/comunicacoes" },
    ];
  }

  return [
    { label: "Gestão de Alunos", to: "/alunos" },
    { label: "Rede Alumni", to: "/alumni" },
    { label: "Importar Dados", to: "/importar" },
    { label: "Biblioteca de Arquivos", to: "/arquivos" },
    { label: "Caixa e Pagamentos", to: "/financeiro" },
    { label: "Relatórios Académicos", to: "/relatorios/academicos" },
    { label: "Emissão de Documentos", to: "/documentos" },
    { label: "Catracas & Cartão", to: "/catracas" },
    { label: "Gestão de Acessos", to: "/acessos" },
  ];
}
