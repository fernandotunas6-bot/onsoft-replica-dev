// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const fixtures = vi.hoisted(() => ({
  exportCsv: vi.fn(),
  rows: [
    {
      studentId: "s1",
      name: "Ana",
      number: "0000001",
      classGroupId: "g1",
      className: "10 A",
      gradeId: "grade",
      gradeName: "10ª",
      programId: "p1",
      programName: "Informática",
      levelId: "l1",
      levelName: "Secundário",
      active: true,
      billed: 25000,
      paid: 10000,
      outstanding: 15000,
      overdue: 15000,
      invoiceCount: 1,
    },
    {
      studentId: "s2",
      name: "Bento",
      number: "0000002",
      classGroupId: "g2",
      className: "10 B",
      gradeId: "grade",
      gradeName: "10ª",
      programId: "p2",
      programName: "Saúde",
      levelId: "l1",
      levelName: "Secundário",
      active: true,
      billed: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
    },
  ],
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: "school" },
    selectedYearId: "year",
    selectedYearLabel: "2026/2027",
  }),
}));
vi.mock("@/features/finance/student-ledger-server", () => ({
  listStudentLedger: async () => fixtures.rows,
}));
vi.mock("@/lib/export-csv", () => ({ exportCsv: fixtures.exportCsv }));
vi.mock("@/features/finance/server", () => ({ issueTuitionBatch: vi.fn() }));
vi.mock("@/components/modals/QuickFormModal", () => ({
  QuickFormModal: ({ trigger }: { trigger: (open: () => void) => ReactNode }) => trigger(() => {}),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
import { StudentLedgerPanel } from "@/features/finance/components/StudentLedgerPanel";
const mount = (blocked = false) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StudentLedgerPanel blocked={blocked} />
    </QueryClientProvider>,
  );
beforeEach(() => {
  localStorage.clear();
  fixtures.exportCsv.mockClear();
  fixtures.rows.splice(2);
});
afterEach(cleanup);
describe("lista financeira — interacções", () => {
  it("filtra por curso e mantém sem facturas distinto de pago", async () => {
    mount();
    await screen.findByText("Ana");
    expect(screen.getByText("Sem facturas", { selector: "span" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Curso"), { target: { value: "p2" } });
    expect(screen.queryByText("Ana")).toBeNull();
    expect(screen.getByText("Bento")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "pago" } });
    expect(screen.queryByText("Bento")).toBeNull();
    expect(screen.getByText("Nenhum aluno corresponde aos filtros.")).toBeTruthy();
  });
  it("só emite seleccionados da mesma turma; mudar filtro limpa selecção", async () => {
    mount();
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Ana" }));
    expect(
      (screen.getByRole("button", { name: "Emitir propinas (1)" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Bento" }));
    expect(
      (screen.getByRole("button", { name: "Emitir propinas (2)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "g1" } });
    expect(
      (screen.getByRole("button", { name: "Emitir propinas (0)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("selecciona/desmarca a página e exporta só dívidas, incluindo matrícula inactiva", async () => {
    fixtures.rows.push({
      ...fixtures.rows[0],
      studentId: "s3",
      name: "Carlos",
      active: false,
      outstanding: 5000,
      overdue: 5000,
    });
    mount();
    await screen.findByText("Carlos");
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar página" }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar cobranças (2)" }));
    const [filename, columns, exported] = fixtures.exportCsv.mock.calls[0];
    expect(filename).toMatch(/^cobrancas-seleccionadas-/);
    expect(exported.map((row: { name: string }) => row.name)).toEqual(["Ana", "Carlos"]);
    expect(
      columns.find((column: { label: string }) => column.label === "Ano lectivo").value(),
    ).toBe("2026/2027");
    expect(
      (screen.getByRole("button", { name: "Emitir propinas (3)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar página" }));
    expect(
      (screen.getByRole("button", { name: "Exportar cobranças (0)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("mantém selecção entre páginas e impede ultrapassar 60 alunos", async () => {
    for (let i = 3; i <= 73; i++)
      fixtures.rows.push({ ...fixtures.rows[0], studentId: `s${i}`, name: `Aluno ${i}` });
    mount();
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar página" }));
    fireEvent.click(screen.getByRole("button", { name: "Página seguinte" }));
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar página" }));
    expect(screen.getByRole("button", { name: "Limpar selecção (50)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Página seguinte" }));
    expect(
      (screen.getByRole("button", { name: "Seleccionar página" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const checkbox of screen.getAllByRole("checkbox").slice(0, 10)) fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Limpar selecção (60)" })).toBeTruthy();
    expect(screen.getAllByRole("checkbox")[10].getAttribute("data-disabled")).not.toBeNull();
  });
  it("não emite quando a configuração financeira está bloqueada", async () => {
    mount(true);
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Ana" }));
    expect(
      (screen.getByRole("button", { name: "Emitir propinas (1)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
