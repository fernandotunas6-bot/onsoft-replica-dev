import type { SuggestionRule } from "../types";

export type DashboardOverviewSnapshot = {
  academicYear: { name: string } | null;
  overviewCounts: { students: number; classes: number };
  pendingEnrollmentApplications: number;
  unpaidInvoices: number;
  upcomingEvents: number;
};

export function buildDashboardSuggestionRules(): SuggestionRule<DashboardOverviewSnapshot>[] {
  return [
    {
      id: "dashboard-ano-letivo",
      evaluate: (snapshot) =>
        !snapshot.academicYear
          ? {
              id: "dashboard-ano-letivo",
              priority: 100,
              category: "geral",
              module: "configuracoes",
              title: "Configurar ano letivo",
              description: "A escola ainda não tem um ano letivo ativo configurado.",
              route: "/calendario",
              reason: "Configuração crítica em falta.",
            }
          : null,
    },
    {
      id: "dashboard-candidaturas",
      evaluate: (snapshot) =>
        snapshot.pendingEnrollmentApplications > 0
          ? {
              id: "dashboard-candidaturas",
              priority: 95,
              category: "matricula",
              module: "pessoas",
              title: "Avaliar candidaturas pendentes",
              description: `Tem ${snapshot.pendingEnrollmentApplications} pedido(s) de admissão aguardando aprovação.`,
              route: "/alunos",
              reason: "Candidaturas pendentes exigem intervenção.",
            }
          : null,
    },
    {
      id: "dashboard-faturas-atraso",
      evaluate: (snapshot) =>
        snapshot.unpaidInvoices > 0
          ? {
              id: "dashboard-faturas-atraso",
              priority: 90,
              category: "financeiro",
              module: "financeiro",
              title: "Liquidar faturas pendentes",
              description: `Existem ${snapshot.unpaidInvoices} fatura(s) não pagas no sistema.`,
              route: "/faturas",
              reason: "Faturas por liquidar impactam o cash-flow.",
            }
          : null,
    },
    {
      id: "dashboard-calendario-vazio",
      evaluate: (snapshot) =>
        snapshot.upcomingEvents === 0 && snapshot.academicYear
          ? {
              id: "dashboard-calendario-vazio",
              priority: 40,
              category: "geral",
              module: "calendario",
              title: "Adicionar eventos ao calendário",
              description: "Não existem eventos próximos agendados.",
              route: "/calendario",
              reason: "Manter o calendário escolar atualizado melhora a comunicação.",
            }
          : null,
    },
    {
      id: "dashboard-relatorios",
      evaluate: () => ({
        id: "dashboard-relatorios",
        priority: 10,
        category: "geral",
        module: "dashboard",
        title: "Explorar relatórios globais",
        route: "/relatorios/academicos",
        reason: "Monitorização proativa da saúde da escola.",
      }),
    },
  ];
}
