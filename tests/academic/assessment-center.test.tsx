// @vitest-environment jsdom
/**
 * Testes de caracterização do Centro de Avaliação (lançamento de notas).
 *
 * Fixam o comportamento actual antes de o componente (≈1900 linhas) ser
 * dividido em estado, cálculo e apresentação: qualquer diferença depois da
 * divisão é regressão. Os cálculos (angola-academic, assessment-model) e a
 * grelha são os reais; só os hooks de contexto e o servidor são simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";

vi.setConfig({ testTimeout: 20_000 });

const listAssessmentsMock = vi.fn();
const upsertTermGradesBatchMock = vi.fn();
const upsertAssessmentScoresMock = vi.fn();

vi.mock("@/features/academic/server", () => ({
  listAssessments: (args: unknown) => listAssessmentsMock(args),
  upsertTermGradesBatch: (args: unknown) => upsertTermGradesBatchMock(args),
  upsertAssessmentScores: (args: unknown) => upsertAssessmentScoresMock(args),
}));
vi.mock("@/features/school/server", () => ({ setTermLock: vi.fn() }));
vi.mock("@/features/academic/use-passing-value", () => ({
  useActiveAssessmentRule: () => ({
    passing: 10,
    promotionRules: {},
    hasModel: false,
    engine: null,
  }),
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    selectedTerm: { id: "t1", sequence: 1 },
    terms: [
      { id: "t1", sequence: 1 },
      { id: "t2", sequence: 2 },
      { id: "t3", sequence: 3 },
    ],
    setSelectedTermId: vi.fn(),
    school: null,
  }),
}));
vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({ hasCapability: () => false }),
}));
vi.mock("@/features/documents/print-issue-loader", () => ({ issuePrintDocument: vi.fn() }));
vi.mock("@/lib/export-pdf-loader", () => ({ exportOfficialPautaPdf: vi.fn() }));

const { AssessmentCenter } = await import("@/features/academic/AssessmentCenter");

type Props = ComponentProps<typeof AssessmentCenter>;

const baseProps: Props = {
  open: true,
  onOpenChange: () => {},
  schoolName: "Escola Teste",
  academicYear: "2026",
  directorName: null,
  classGroups: [{ id: "cg1", name: "10ª A", grade_name: "10ª Classe", course_name: "Ciências" }],
  subjects: [{ id: "sub1", name: "Matemática", code: "MAT" }],
  enrollments: [
    {
      id: "e2",
      student_name: "Bruno Costa",
      registration_number: "002",
      class_group_id: "cg1",
      class_group_name: "10ª A",
    },
    {
      id: "e1",
      student_name: "Ana Silva",
      registration_number: "001",
      class_group_id: "cg1",
      class_group_name: "10ª A",
    },
  ],
  termGrades: [{ enrollment_id: "e1", subject_id: "sub1", term: 1, mac: 12, npp: 14, npt: 16 }],
  classSubjects: [{ class_group_id: "cg1", subject_id: "sub1" }],
  passingGrade: 10,
  canLaunch: true,
  canLockTerm: true,
  closedTerms: [],
  initialTerm: "1",
  initialClassGroupId: "cg1",
  initialSubjectId: "sub1",
};

function renderCenter(overrides: Partial<Props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssessmentCenter {...baseProps} {...overrides} />
    </QueryClientProvider>,
  );
}

/**
 * Espera pelas notas e pela lista de avaliações. Quando a lista chega, o
 * componente recarrega os valores e apaga o que já se tinha escrito (ver o
 * teste "edição antes da lista chegar"); por isso só se edita depois disto.
 */
async function ready() {
  await waitFor(() => expect(listAssessmentsMock).toHaveBeenCalled());
  await act(async () => {});
}

const rowText = (student: string) => {
  const row = screen.getByText(student).closest("tr");
  if (!row) throw new Error(`linha de ${student} não encontrada`);
  return row.textContent ?? "";
};

const cell = (field: string, student: string) =>
  screen.getByLabelText(`${field} de ${student}`) as HTMLInputElement;

const rowOf = (student: string) => {
  const row = cell("MAC", student).closest("tr");
  if (!row) throw new Error(`linha de ${student} não encontrada`);
  return row;
};

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* sem armazenamento */
  }
  listAssessmentsMock.mockResolvedValue({ available: true, items: [], scores: [] });
  upsertTermGradesBatchMock.mockResolvedValue({ ok: true });
  upsertAssessmentScoresMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Centro de Avaliação — lançamento de notas", () => {
  it("carrega os alunos por ordem alfabética, com as notas já lançadas", async () => {
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    expect(cell("NPP", "Ana Silva").value).toBe("14");
    expect(cell("NPT", "Ana Silva").value).toBe("16");
    expect(cell("MAC", "Bruno Costa").value).toBe("");

    const names = screen
      .getAllByLabelText(/^MAC de /)
      .map((input) => input.getAttribute("aria-label")?.replace("MAC de ", ""));
    expect(names).toEqual(["Ana Silva", "Bruno Costa"]);
  });

  it("editar uma nota recalcula a média da linha", async () => {
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    await ready();
    const before = within(rowOf("Ana Silva")).getByText(MEDIA_INICIAL);
    expect(before).toBeTruthy();

    fireEvent.change(cell("MAC", "Ana Silva"), { target: { value: "18" } });
    await waitFor(() => expect(within(rowOf("Ana Silva")).getByText(MEDIA_DEPOIS)).toBeTruthy());
  });

  it("desfazer e refazer repõem os valores", async () => {
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    await ready();

    fireEvent.change(cell("MAC", "Ana Silva"), { target: { value: "18" } });
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("18"));

    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));

    fireEvent.click(screen.getByRole("button", { name: "Refazer" }));
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("18"));
  });

  it("gravar envia só as linhas com MAC, NPP e NPT preenchidos", async () => {
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    await ready();

    fireEvent.change(cell("MAC", "Ana Silva"), { target: { value: "18" } });
    // Bruno fica incompleto (só MAC): não pode ir para a pauta.
    fireEvent.change(cell("MAC", "Bruno Costa"), { target: { value: "9" } });

    fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar pauta da disciplina" }));

    await waitFor(() => expect(upsertTermGradesBatchMock).toHaveBeenCalledTimes(1));
    expect(upsertTermGradesBatchMock).toHaveBeenCalledWith({
      data: {
        subjectId: "sub1",
        term: 1,
        rows: [{ enrollmentId: "e1", mac: 18, npp: 14, npt: 16 }],
      },
    });
  });

  it("com o trimestre fechado, as notas aparecem só para leitura e não se gravam", async () => {
    renderCenter({ closedTerms: [1] });
    await waitFor(() => expect(rowText("Ana Silva")).toContain("121416"));
    expect(screen.queryByLabelText("MAC de Ana Silva")).toBeNull();
    expect((screen.getByRole("button", { name: /^Guardar$/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("sem permissão de lançamento, as notas aparecem só para leitura", async () => {
    renderCenter({ canLaunch: false });
    await waitFor(() => expect(rowText("Ana Silva")).toContain("121416"));
    expect(screen.queryByLabelText("MAC de Ana Silva")).toBeNull();
  });

  it("média e situação da linha com as notas já lançadas", async () => {
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    await ready();
    expect(rowText("Ana Silva")).toContain(`${MEDIA_INICIAL}Transita`);
    // Sem notas, a média fica por calcular e a situação pendente.
    expect(rowText("Bruno Costa")).toContain("—Pendente");
  });

  // Corrigido a 29/09: o que se escrevia antes de a lista de avaliações chegar
  // era apagado quando ela chegava (o componente recarregava os valores).
  it("edição feita antes de a lista de avaliações chegar não se perde", async () => {
    let resolveList: (value: unknown) => void = () => {};
    listAssessmentsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    renderCenter();
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));

    fireEvent.change(cell("MAC", "Ana Silva"), { target: { value: "18" } });
    expect(cell("MAC", "Ana Silva").value).toBe("18");

    await act(async () => {
      resolveList({ available: true, items: [], scores: [] });
    });
    await ready();
    expect(cell("MAC", "Ana Silva").value).toBe("18");
    // As células que não se tocaram continuam com o valor do servidor.
    expect(cell("NPP", "Ana Silva").value).toBe("14");
    // A edição continua a poder ser desfeita.
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
  });

  it("mudar de disciplina recarrega as notas e descarta as edições da anterior", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (props: Partial<Props>) => (
      <QueryClientProvider client={client}>
        <AssessmentCenter {...baseProps} {...props} />
      </QueryClientProvider>
    );
    const subjects = [...baseProps.subjects, { id: "sub2", name: "Física", code: "FIS" }];
    const { rerender } = render(view({ subjects }));
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
    await ready();
    fireEvent.change(cell("MAC", "Ana Silva"), { target: { value: "18" } });

    rerender(view({ subjects, initialSubjectId: "sub2" }));
    // Física não tem notas: a edição feita em Matemática não passa para cá.
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe(""));

    rerender(view({ subjects, initialSubjectId: "sub1" }));
    await waitFor(() => expect(cell("MAC", "Ana Silva").value).toBe("12"));
  });
});

// Sem modelo publicado vale o Decreto 424/25: MT = (MACT + NPT) ÷ 2, com a
// NPP já dentro da MACT. MAC 12 / NPT 16 → 14.0; MAC 18 / NPT 16 → 17.0.
const MEDIA_INICIAL = "14.0";
const MEDIA_DEPOIS = "17.0";
