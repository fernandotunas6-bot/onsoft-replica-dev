// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nextYearGuess } from "@/features/academic/year-rollover";

vi.setConfig({ testTimeout: 20_000 });

const getRenewalPlanMock = vi.fn();
const applyRenewalMock = vi.fn();
vi.mock("@/features/academic/year-rollover-server", () => ({
  getRenewalPlan: (args: unknown) => getRenewalPlanMock(args),
  applyRenewal: (args: unknown) => applyRenewalMock(args),
}));

const { TurmaRenewalPanel } = await import("@/features/academic/components/TurmaRenewalPanel");

const years = [
  { id: "y25", name: "2025/2026" },
  { id: "y26", name: "2026/2027" },
  { id: "y27", name: "2027/2028" },
];

const plan = {
  source: { id: "7a", name: "A", yearName: "2025/2026", gradeName: "7.ª Classe" },
  targetYear: { id: "y26", name: "2026/2027" },
  isLastGrade: false,
  gradeOrderKnown: true,
  passOptions: [{ id: "8a", name: "8.ª A", free: 30 }],
  repeatOptions: [{ id: "7a-27", name: "7.ª A", free: 5 }],
  passClassGroupId: "8a",
  repeatClassGroupId: "7a-27",
  lines: [
    {
      studentId: "s1",
      name: "Ana",
      outcome: "pass",
      action: "enroll",
      targetClassGroupId: "8a",
      reason: "Transitou.",
    },
    {
      studentId: "s2",
      name: "Bia",
      outcome: "fail",
      action: "enroll",
      targetClassGroupId: "7a-27",
      reason: "Não transitou: repete a classe.",
    },
    {
      studentId: "s3",
      name: "Caio",
      outcome: null,
      action: "skip",
      targetClassGroupId: null,
      reason: "Sem resultado final registado no histórico.",
    },
  ],
};

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRenewed = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <TurmaRenewalPanel
        classGroupId="7a"
        currentYearId="y25"
        currentYearName="2025/2026"
        academicYears={years}
        onRenewed={onRenewed}
      />
    </QueryClientProvider>,
  );
  return { onRenewed };
}

describe("renovar matrículas da turma para o próximo ano", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("propõe o ano seguinte ao da turma", () => {
    expect(nextYearGuess(years, "2025/2026")).toBe("y26");
    expect(nextYearGuess(years, "2027/2028")).toBe("");
  });

  it("mostra o plano com os motivos e matricula só os alunos marcados", async () => {
    getRenewalPlanMock.mockResolvedValue(plan);
    applyRenewalMock.mockResolvedValue({
      enrolled: [{ studentId: "s2", name: "Bia" }],
      failed: [],
      skipped: 2,
    });
    const { onRenewed } = renderModal();

    expect((screen.getByLabelText("Ano de destino") as HTMLSelectElement).value).toBe("y26");
    const list = await screen.findByRole("list", { name: "Alunos da turma" });
    expect(within(list).getByText("Sem resultado final registado no histórico.")).toBeTruthy();
    expect((screen.getByLabelText("Matricular Caio") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/transitam 1, não transitam 1, sem resultado 1/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Matricular Ana"));
    fireEvent.click(screen.getByRole("button", { name: "Matricular 1 aluno(s)" }));

    await waitFor(() =>
      expect(applyRenewalMock).toHaveBeenCalledWith({
        data: {
          sourceClassGroupId: "7a",
          targetAcademicYearId: "y26",
          passClassGroupId: "8a",
          repeatClassGroupId: "7a-27",
          studentIds: ["s2"],
        },
      }),
    );
    await waitFor(() => expect(onRenewed).toHaveBeenCalled());
  });

  it("erro do servidor (ex.: ano de destino anterior) aparece no ecrã", async () => {
    getRenewalPlanMock.mockRejectedValue(
      new Error("O ano de destino tem de começar depois do ano da turma de origem."),
    );
    renderModal();
    expect(
      await screen.findByText("O ano de destino tem de começar depois do ano da turma de origem."),
    ).toBeTruthy();
  });
});
