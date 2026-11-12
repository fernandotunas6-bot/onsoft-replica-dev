/**
 * Prioridades da entrada administrativa: apenas contagens já devolvidas pelo
 * DashboardOverview e apenas destinos autorizados. Não inventar pendências.
 */
export type HomeFocusInput = {
  applicants?: number | null;
  documentsPending?: number | null;
  invoicesOpen?: number | null;
  upcomingEvents?: number | null;
  canManageStudents: boolean;
  canReadDocuments: boolean;
  canReadInvoices: boolean;
  canReadCalendar: boolean;
};

export type HomeFocusItem = {
  id: "applications" | "documents" | "invoices" | "events";
  title: string;
  detail: string;
  count: number;
  to: "/alunos" | "/documentos" | "/faturas" | "/calendario";
};

function positiveCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Ordem por actividade, não por valor monetário nem gravidade presumida. */
export function buildHomeFocusItems(input: HomeFocusInput): HomeFocusItem[] {
  const items: HomeFocusItem[] = [];
  if (input.canManageStudents && positiveCount(input.applicants)) {
    items.push({
      id: "applications",
      title: "Candidaturas por confirmar",
      detail: "Abrir as matrículas",
      count: positiveCount(input.applicants),
      to: "/alunos",
    });
  }
  if (input.canReadDocuments && positiveCount(input.documentsPending)) {
    items.push({
      id: "documents",
      title: "Documentos pendentes",
      detail: "Consultar os pedidos",
      count: positiveCount(input.documentsPending),
      to: "/documentos",
    });
  }
  if (input.canReadInvoices && positiveCount(input.invoicesOpen)) {
    items.push({
      id: "invoices",
      title: "Faturas em aberto",
      detail: "Abrir a tesouraria",
      count: positiveCount(input.invoicesOpen),
      to: "/faturas",
    });
  }
  if (input.canReadCalendar && positiveCount(input.upcomingEvents)) {
    items.push({
      id: "events",
      title: "Próximos eventos",
      detail: "Ver calendário",
      count: positiveCount(input.upcomingEvents),
      to: "/calendario",
    });
  }
  return items;
}
