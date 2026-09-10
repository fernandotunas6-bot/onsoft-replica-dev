import {
  Banknote,
  BriefcaseBusiness,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  CreditCard,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  GraduationCap,
  History,
  LayoutGrid,
  Link2,
  Megaphone,
  Network,
  NotebookPen,
  PieChart,
  Plug,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  User,
} from "lucide-react";
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
            { label: "Início", icon: LayoutGrid, to: "/" },
            {
              label: "Académico",
              icon: GraduationCap,
              children: [
                {
                  label: "Minha Turma",
                  icon: BookOpen,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Horário",
                  icon: CalendarDays,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
                {
                  label: "Avaliações e Notas",
                  icon: PieChart,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
              ],
            },
            { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
            {
              label: "Frequência",
              icon: CheckSquare,
              to: "/pedagogica",
              search: { tab: "presencas" },
            },
            {
              label: "Financeiro",
              icon: CreditCard,
              to: "/financeiro",
            },
            { label: "Documentos", icon: FileText, to: "/documentos" },
            { label: "Comunicação", icon: Megaphone, to: "/comunicacoes" },
            { label: "Meu Portal Alumni", icon: Network, to: "/alumni/portal" },
            { label: "Meu Perfil", icon: User, to: "/perfil" },
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
            { label: "Meu Educando", icon: LayoutGrid, to: "/" },
            {
              label: "Desempenho",
              icon: PieChart,
              children: [
                {
                  label: "Notas e Boletim",
                  icon: PieChart,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
                {
                  label: "Turma e Disciplinas",
                  icon: BookOpen,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Horário de Aulas",
                  icon: CalendarDays,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
              ],
            },
            { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
            {
              label: "Frequência",
              icon: CheckSquare,
              to: "/pedagogica",
              search: { tab: "presencas" },
            },
            {
              label: "Financeiro",
              icon: CreditCard,
              children: [
                { label: "Propinas e Faturas", icon: CreditCard, to: "/financeiro" },
                { label: "Recibos", icon: Receipt, to: "/faturas" },
              ],
            },
            { label: "Documentos", icon: FileText, to: "/documentos" },
            { label: "Comunicação", icon: Megaphone, to: "/comunicacoes" },
            { label: "Meu Perfil", icon: User, to: "/perfil" },
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
            { label: "Início", icon: LayoutGrid, to: "/" },
            {
              label: "Frequência",
              icon: CheckSquare,
              children: [
                {
                  label: "Fazer Chamada",
                  icon: CheckSquare,
                  to: "/pedagogica",
                  search: { tab: "chamada" },
                },
                {
                  label: "Histórico de Presenças",
                  icon: CheckSquare,
                  to: "/pedagogica",
                  search: { tab: "presencas" },
                },
                {
                  label: "Minha presença (QR)",
                  icon: QrCode,
                  to: "/professor/presenca",
                },
              ],
            },
            {
              label: "Ensino e Avaliações",
              icon: BookOpen,
              children: [
                {
                  label: "Minhas Turmas",
                  icon: BookOpen,
                  to: "/pedagogica",
                  search: { tab: "turmas" },
                },
                {
                  label: "Lançar Notas e Pautas",
                  icon: PieChart,
                  to: "/pedagogica",
                  search: { tab: "notas" },
                },
                {
                  label: "Horário de Aulas",
                  icon: CalendarDays,
                  to: "/pedagogica",
                  search: { tab: "horarios" },
                },
                { label: "Planos de Aula", icon: NotebookPen, to: "/planos-aula" },
              ],
            },
            { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
            { label: "Biblioteca & Materiais", icon: FolderOpen, to: "/arquivos" },
            { label: "Comunicação", icon: Megaphone, to: "/comunicacoes" },
            { label: "Meu Perfil", icon: User, to: "/perfil" },
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
        { label: "Início", icon: LayoutGrid, to: "/" },
        { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
      ],
    },
    {
      title: "Académico",
      items: [
        {
          label: "Área Pedagógica",
          icon: BookOpen,
          children: [
            {
              label: "Turmas e Disciplinas",
              icon: BookOpen,
              to: "/pedagogica",
              search: { tab: "turmas" },
            },
            {
              label: "Notas e Avaliações",
              icon: PieChart,
              to: "/pedagogica",
              search: { tab: "notas" },
            },
            {
              label: "Horários",
              icon: CalendarDays,
              to: "/pedagogica",
              search: { tab: "horarios" },
            },
            {
              label: "Presenças e Chamada",
              icon: CheckSquare,
              to: "/pedagogica",
              search: { tab: "chamada" },
            },
            {
              label: "Planos de Aula",
              icon: NotebookPen,
              to: "/planos-aula",
            },
          ],
        },
      ],
    },
    {
      title: "Secretaria",
      items: [
        { label: "Pessoas", icon: UserCog, to: "/pessoas" },
        {
          label: "Importação de Dados",
          icon: FileUp,
          children: [
            { label: "Nova Importação", icon: FileUp, to: "/importar", search: { tab: "novo" } },
            {
              label: "Histórico & Auditoria",
              icon: History,
              to: "/importar",
              search: { tab: "historico" },
            },
            {
              label: "Modelos Oficiais Excel",
              icon: Download,
              to: "/importar",
              search: { tab: "modelos" },
            },
          ],
        },
        {
          label: "Gestão de Alunos",
          icon: Users,
          children: [
            { label: "Lista de Alunos", icon: GraduationCap, to: "/alunos" },
            {
              label: "Matricular Aluno",
              icon: UserPlus,
              to: "/alunos",
              search: { action: "matricular" },
            },
            {
              label: "Confirmar Matrícula",
              icon: UserCheck,
              to: "/alunos",
              search: { action: "confirmar" },
            },
            { label: "Estado do Aluno", icon: Users, to: "/alunos", search: { action: "estado" } },
            { label: "Alumni · Antigos Alunos", icon: Network, to: "/alumni" },
          ],
        },
        {
          label: "Documentos",
          icon: FileText,
          children: [{ label: "Emissão de Documentos", icon: FileText, to: "/documentos" }],
        },
        { label: "Biblioteca de Arquivos", icon: FolderOpen, to: "/arquivos" },
      ],
    },
    {
      title: "Financeiro",
      items: [
        {
          label: "Caixa e Pagamentos",
          icon: CreditCard,
          children: [
            { label: "Movimentos de Caixa", icon: CreditCard, to: "/financeiro" },
            { label: "Faturas e Recibos", icon: Receipt, to: "/faturas" },
            { label: "RH e Folha Salarial", icon: BriefcaseBusiness, to: "/financeiro/rh" },
            { label: "Processar Folha", icon: BriefcaseBusiness, to: "/financeiro/rh/folha" },
            { label: "Ordens de Pagamento RH", icon: Banknote, to: "/financeiro/rh/pagamentos" },
            { label: "Faltas e Assiduidade", icon: History, to: "/financeiro/rh/faltas" },
            { label: "Validação de Presença", icon: QrCode, to: "/financeiro/rh/presenca" },
          ],
        },
      ],
    },
    {
      title: "Relatórios",
      items: [
        { label: "Relatórios Financeiros", icon: TrendingUp, to: "/relatorios/financeiros" },
        { label: "Relatórios Académicos", icon: PieChart, to: "/relatorios/academicos" },
      ],
    },
    {
      title: "Gestão e Comunicação",
      items: [
        { label: "Catracas & Cartão Virtual", icon: QrCode, to: "/catracas" },
        { label: "Gestão de Acessos", icon: UserCog, to: "/acessos" },
        { label: "Comunicações", icon: Megaphone, to: "/comunicacoes" },
      ],
    },
    {
      title: "Sistema",
      items: [
        {
          label: "Definições",
          icon: Settings,
          children: [
            {
              label: "Escola e branding",
              icon: Building2,
              to: "/configuracoes",
              search: { painel: "escola" },
            },
            {
              label: "Matrícula online",
              icon: Link2,
              to: "/configuracoes",
              search: { painel: "matricula" },
            },
            {
              label: "Integrações",
              icon: Plug,
              to: "/configuracoes",
              search: { painel: "integracoes" },
            },
            {
              label: "Financeiro",
              icon: CreditCard,
              to: "/configuracoes",
              search: { painel: "financeiro" },
            },
            {
              label: "Segurança",
              icon: ShieldCheck,
              to: "/configuracoes",
              search: { painel: "seguranca" },
            },
          ],
        },
        { label: "Meu Perfil", icon: User, to: "/perfil" },
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
