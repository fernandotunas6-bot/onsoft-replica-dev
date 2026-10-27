import { describe, expect, it } from "vitest";
import { buildHomeFocusItems, type HomeFocusInput } from "@/features/dashboard/home-focus";

const base: HomeFocusInput = {
  applicants: 3,
  documentsPending: 2,
  invoicesOpen: 5,
  upcomingEvents: 1,
  canManageStudents: true,
  canReadDocuments: true,
  canReadInvoices: true,
  canReadCalendar: true,
};

describe("prioridades visuais do Início", () => {
  it("mostra apenas prioridades com contagens positivas e acessos autorizados", () => {
    expect(buildHomeFocusItems(base)).toMatchObject([
      { id: "applications", count: 3, to: "/alunos" },
      { id: "documents", count: 2, to: "/documentos" },
      { id: "invoices", count: 5, to: "/faturas" },
      { id: "events", count: 1, to: "/calendario" },
    ]);
  });

  it("não revela indicadores financeiros ou académicos a funções sem acesso", () => {
    const items = buildHomeFocusItems({
      ...base,
      canManageStudents: false,
      canReadDocuments: false,
      canReadInvoices: false,
    });
    expect(items).toEqual([
      {
        id: "events",
        title: "Próximos eventos",
        detail: "Ver calendário",
        count: 1,
        to: "/calendario",
      },
    ]);
  });

  it("não inventa números quando os dados são indisponíveis ou inválidos", () => {
    expect(
      buildHomeFocusItems({
        ...base,
        applicants: null,
        documentsPending: undefined,
        invoicesOpen: Number.NaN,
        upcomingEvents: 0,
      }),
    ).toEqual([]);
  });

  it("não apresenta números fraccionários como tarefas diferentes", () => {
    expect(
      buildHomeFocusItems({
        ...base,
        applicants: 2.8,
        documentsPending: 0,
        invoicesOpen: 0,
        upcomingEvents: 0,
      })[0]?.count,
    ).toBe(2);
  });
});
