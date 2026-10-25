// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.setConfig({ testTimeout: 20_000 });

const server = {
  listTaskSubmissions: vi.fn(),
  recordPaperSubmission: vi.fn(),
  returnTaskSubmission: vi.fn(),
  getMyTaskSubmission: vi.fn(),
  submitTaskWork: vi.fn(),
};
vi.mock("@/features/academic/task-submissions-server", () => ({
  listTaskSubmissions: (a: unknown) => server.listTaskSubmissions(a),
  recordPaperSubmission: (a: unknown) => server.recordPaperSubmission(a),
  returnTaskSubmission: (a: unknown) => server.returnTaskSubmission(a),
  getMyTaskSubmission: (a: unknown) => server.getMyTaskSubmission(a),
  submitTaskWork: (a: unknown) => server.submitTaskWork(a),
}));

const { TaskSubmissionsPanel, MyTaskSubmission } =
  await import("@/features/academic/components/TaskSubmissions");

const TASK = "00000000-0000-0000-0000-0000000000f1";
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

const submission = (extra = {}) => ({
  id: "sub-1",
  enrollment_id: "e1",
  attempt: 2,
  status: "submitted",
  submitted_at: "2026-11-01T10:00:00Z",
  is_late: true,
  on_paper: false,
  body: "Resumo do capítulo 3",
  grade: null,
  feedback: null,
  returned_at: null,
  ...extra,
});

describe("entregas: professor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("vê quem entregou, devolve com nota e regista a entrega em papel", async () => {
    server.listTaskSubmissions.mockResolvedValue({
      title: "Resumo",
      dueOn: "2026-11-01",
      acceptsLate: true,
      lines: [
        { enrollmentId: "e1", studentName: "Ana", submission: submission(), attempts: 2 },
        { enrollmentId: "e2", studentName: "Bia", submission: null, attempts: 0 },
      ],
    });
    server.returnTaskSubmission.mockResolvedValue({ ok: true });
    server.recordPaperSubmission.mockResolvedValue({ attempt: 1 });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);

    const list = await screen.findByRole("list", { name: "Entregas da turma" });
    expect(screen.getByText("Entregaram 1 de 2.")).toBeTruthy();
    expect(list.textContent).toContain("2.ª tentativa");
    expect(list.textContent).toContain("com atraso");
    expect(list.textContent).toContain("Resumo do capítulo 3");

    const ana = within(list).getByText("Ana").closest("li")!;
    fireEvent.click(within(ana).getByRole("button", { name: "Devolver" }));
    fireEvent.change(screen.getByLabelText("Nota de Ana"), { target: { value: "14,5" } });
    fireEvent.change(screen.getByLabelText("Comentário para Ana"), {
      target: { value: "Bom trabalho" },
    });
    fireEvent.click(within(ana).getByRole("button", { name: "Devolver" }));
    await waitFor(() =>
      expect(server.returnTaskSubmission).toHaveBeenCalledWith({
        data: { taskId: TASK, submissionId: "sub-1", grade: 14.5, feedback: "Bom trabalho" },
      }),
    );

    const bia = within(list).getByText("Bia").closest("li")!;
    fireEvent.click(within(bia).getByRole("button", { name: "Entregou em papel" }));
    await waitFor(() =>
      expect(server.recordPaperSubmission).toHaveBeenCalledWith({
        data: { taskId: TASK, enrollmentId: "e2" },
      }),
    );
  });

  it("sem permissão: mostra o motivo do servidor", async () => {
    server.listTaskSubmissions.mockRejectedValue(
      new Error("Só o professor desta disciplina (ou a direcção) pode ver estas entregas."),
    );
    wrap(<TaskSubmissionsPanel taskId={TASK} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("entregas: aluno e encarregado", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("o aluno entrega o trabalho", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: null,
      canSubmit: true,
      acceptsLate: true,
      dueOn: "2026-11-01",
    });
    server.submitTaskWork.mockResolvedValue({ attempt: 1, late: false });
    wrap(<MyTaskSubmission taskId={TASK} />);

    expect(await screen.findByText("Ainda não entregue.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("O meu trabalho"), {
      target: { value: "A minha resposta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    await waitFor(() =>
      expect(server.submitTaskWork).toHaveBeenCalledWith({
        data: { taskId: TASK, body: "A minha resposta" },
      }),
    );
  });

  it("depois de devolvido: vê a nota e o comentário, e já não reenvia", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: {
        attempt: 1,
        status: "returned",
        submittedAt: "2026-11-01T10:00:00Z",
        isLate: false,
        onPaper: false,
        body: "x",
        grade: 16,
        feedback: "Muito bem",
        returnedAt: "2026-11-02T10:00:00Z",
      },
      canSubmit: true,
      acceptsLate: true,
      dueOn: null,
    });
    wrap(<MyTaskSubmission taskId={TASK} />);
    expect(await screen.findByText("Devolvido · 16 valores")).toBeTruthy();
    expect(screen.getByText("Comentário do professor: Muito bem")).toBeTruthy();
    expect(screen.queryByLabelText("O meu trabalho")).toBeNull();
  });

  it("o encarregado acompanha, mas não entrega pelo educando", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: null,
      canSubmit: false,
      acceptsLate: true,
      dueOn: null,
    });
    wrap(<MyTaskSubmission taskId={TASK} studentId="00000000-0000-0000-0000-0000000000a1" />);
    expect(await screen.findByText("Ainda não entregue.")).toBeTruthy();
    expect(screen.queryByLabelText("O meu trabalho")).toBeNull();
    expect(server.getMyTaskSubmission).toHaveBeenCalledWith({
      data: { taskId: TASK, studentId: "00000000-0000-0000-0000-0000000000a1" },
    });
  });
});
