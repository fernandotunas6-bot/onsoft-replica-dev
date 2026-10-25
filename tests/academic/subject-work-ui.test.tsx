// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildSubjectYearReport } from "@/features/academic/student-grade-report";

vi.setConfig({ testTimeout: 20_000 });

const SUBJECT = "00000000-0000-0000-0000-0000000000b1";
const term = (mt: number) => ({ mac: mt, npp: null, npt: mt, mt, provisional: false });
let terms = [term(8), term(9), term(8.5)];

vi.mock("@/features/academic/student-grades", () => ({
  getMyStudentGrades: () =>
    Promise.resolve({
      years: [
        {
          academicYearId: "y1",
          name: "2026/2027",
          className: "10ª A",
          isCurrent: true,
          termCount: 3,
          average: null,
          subjects: [
            buildSubjectYearReport({
              subjectId: SUBJECT,
              subjectName: "Matemática",
              terms,
              termCount: 3,
              passing: 10,
            }),
          ],
          officialResult: null,
        },
      ],
    }),
}));

const view = (extra = {}) => ({
  attempt: 1,
  status: "submitted",
  submittedAt: "2026-10-30T10:00:00Z",
  isLate: false,
  onPaper: false,
  body: "A minha resposta",
  grade: null,
  feedback: null,
  returnedAt: null,
  ...extra,
});
const task = (extra = {}) => ({
  id: "t1",
  title: "Resumo",
  kind: "trabalho",
  description: null,
  dueOn: "2026-11-01",
  archived: false,
  acceptsLate: true,
  countsForPauta: false,
  state: "open",
  latest: null,
  attempts: [],
  ...extra,
});
const subjectWork = vi.fn();
vi.mock("@/features/academic/subject-work-server", () => ({
  getMySubjectWork: (a: unknown) => subjectWork(a),
}));
vi.mock("@/features/academic/task-submissions-server", () => ({
  getMyTaskSubmission: () =>
    Promise.resolve({ submission: null, canSubmit: true, acceptsLate: true, dueOn: null }),
  submitTaskWork: vi.fn(),
  listTaskSubmissions: vi.fn(),
  linkTaskAssessment: vi.fn(),
  recordPaperSubmission: vi.fn(),
  returnTaskSubmission: vi.fn(),
  updateTaskSettings: vi.fn(),
  openTaskSubmissionFile: vi.fn(),
}));

const { SubjectWorkView } = await import("@/features/academic/components/SubjectWorkPage");

const wrap = (studentId?: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SubjectWorkView subjectId={SUBJECT} studentId={studentId} />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  terms = [term(8), term(9), term(8.5)];
});

const WORK = {
  subjectName: "Matemática",
  canSubmit: true,
  summary: { total: 3, delivered: 2, returned: 1, late: 1, average: 15 },
  tasks: [
    task({ id: "t-open", title: "Por fazer", state: "overdue" }),
    task({
      id: "t-ret",
      title: "Ensaio",
      state: "returned",
      countsForPauta: true,
      latest: view({ attempt: 2, status: "returned", grade: 15, feedback: "Muito bem" }),
      attempts: [
        view({ attempt: 2, status: "returned", grade: 15, feedback: "Muito bem" }),
        view({ attempt: 1, body: "Primeira", isLate: true }),
      ],
    }),
    task({ id: "t-sub", title: "Leitura", kind: "leitura", state: "submitted", latest: view() }),
  ],
};

describe("página da disciplina", () => {
  it("abaixo de 10: a média e a barra a vermelho, com as notas por trimestre", async () => {
    subjectWork.mockResolvedValue(WORK);
    wrap();
    const hero = await screen.findByRole("region", { name: "Média da disciplina" });
    expect(hero.textContent).toContain("8.5");
    expect(hero.textContent).toContain("/ 20");
    const [main] = within(hero).getAllByRole("meter");
    expect(main!.querySelector("[data-tone]")!.getAttribute("data-tone")).toBe("below");
    const termList = within(hero).getByRole("list", { name: "Notas por trimestre" });
    expect(termList.textContent).toContain("2.º trimestre");
    expect(termList.textContent).toContain("9.0");
  });

  it("de 10 em diante: verde", async () => {
    terms = [term(12), term(14), term(13)];
    subjectWork.mockResolvedValue(WORK);
    wrap();
    const hero = await screen.findByRole("region", { name: "Média da disciplina" });
    const [main] = within(hero).getAllByRole("meter");
    expect(main!.querySelector("[data-tone]")!.getAttribute("data-tone")).toBe("pass");
  });

  it("histórico: resumo, filtros, e o detalhe com o comentário e as entregas", async () => {
    subjectWork.mockResolvedValue(WORK);
    wrap();
    const list = await screen.findByRole("list", { name: "Trabalhos da disciplina" });
    expect(screen.getByText("Média dos trabalhos")).toBeTruthy();
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /Devolvidos/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    const ensaio = within(list).getByRole("button", { name: /Ensaio/ });
    expect(ensaio.textContent).toContain("conta para a pauta");
    fireEvent.click(ensaio);
    expect(screen.getByText("Muito bem")).toBeTruthy();
    const attempts = screen.getByRole("list", { name: "Entregas de Ensaio" });
    expect(attempts.textContent).toContain("2.ª entrega");
    expect(attempts.textContent).toContain("1.ª entrega");
    expect(attempts.textContent).toContain("com atraso");
    expect(attempts.textContent).toContain("Primeira");
  });

  it("o atrasado abre logo com o formulário de entrega; o devolvido não o mostra", async () => {
    subjectWork.mockResolvedValue(WORK);
    wrap();
    expect(await screen.findByLabelText("O meu trabalho")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ensaio/ }));
    expect(screen.getAllByLabelText("O meu trabalho")).toHaveLength(1);
  });

  it("encarregado: acompanha sem formulário de entrega", async () => {
    subjectWork.mockResolvedValue({ ...WORK, canSubmit: false });
    wrap("00000000-0000-0000-0000-0000000000c1");
    await screen.findByRole("list", { name: "Trabalhos da disciplina" });
    expect(screen.queryByLabelText("O meu trabalho")).toBeNull();
    expect(subjectWork).toHaveBeenCalledWith({
      data: { subjectId: SUBJECT, studentId: "00000000-0000-0000-0000-0000000000c1" },
    });
  });

  it("sem trabalhos: diz que o professor ainda não passou nenhum", async () => {
    subjectWork.mockResolvedValue({ ...WORK, tasks: [], summary: { ...WORK.summary, total: 0 } });
    wrap();
    expect(await screen.findByText(/ainda não passou trabalhos/)).toBeTruthy();
  });
});
