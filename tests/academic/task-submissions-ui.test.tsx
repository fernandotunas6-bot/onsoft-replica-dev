// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.setConfig({ testTimeout: 20_000 });
// O Switch do Radix mede-se com ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const server = {
  listTaskSubmissions: vi.fn(),
  linkTaskAssessment: vi.fn(),
  updateTaskSettings: vi.fn(),
  recordPaperSubmission: vi.fn(),
  returnTaskSubmission: vi.fn(),
  getMyTaskSubmission: vi.fn(),
  submitTaskWork: vi.fn(),
  openTaskSubmissionFile: vi.fn(),
  syncTaskGradesToPauta: vi.fn(),
};
vi.mock("@/features/academic/task-submissions-server", () => ({
  listTaskSubmissions: (a: unknown) => server.listTaskSubmissions(a),
  linkTaskAssessment: (a: unknown) => server.linkTaskAssessment(a),
  updateTaskSettings: (a: unknown) => server.updateTaskSettings(a),
  recordPaperSubmission: (a: unknown) => server.recordPaperSubmission(a),
  returnTaskSubmission: (a: unknown) => server.returnTaskSubmission(a),
  getMyTaskSubmission: (a: unknown) => server.getMyTaskSubmission(a),
  submitTaskWork: (a: unknown) => server.submitTaskWork(a),
  openTaskSubmissionFile: (a: unknown) => server.openTaskSubmissionFile(a),
  syncTaskGradesToPauta: (a: unknown) => server.syncTaskGradesToPauta(a),
}));

const { TaskSubmissionsPanel, MyTaskSubmission } =
  await import("@/features/academic/components/TaskSubmissions");

const TASK = "00000000-0000-0000-0000-0000000000f1";
const TASK_META = {
  title: "Resumo",
  kind: "trabalho",
  description: null,
  archived: false,
  summary: { total: 2, delivered: 1, returned: 0, late: 1, average: null },
};
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
      ...TASK_META,
      dueOn: "2026-11-01",
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [],
      lines: [
        {
          enrollmentId: "e1",
          studentName: "Ana",
          submission: submission(),
          attempts: 2,
          pautaScore: null,
        },
        { enrollmentId: "e2", studentName: "Bia", submission: null, attempts: 0, pautaScore: null },
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

  it("liga a tarefa a uma avaliação da pauta e mostra a nota que lá está", async () => {
    const item = {
      id: "00000000-0000-0000-0000-0000000000a1",
      name: "Trabalho 1",
      term: 1,
      maxScore: 10,
    };
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [item],
      lines: [
        {
          enrollmentId: "e1",
          studentName: "Ana",
          submission: submission({ status: "returned", grade: 8 }),
          attempts: 1,
          pautaScore: 8,
        },
      ],
    });
    server.linkTaskAssessment.mockResolvedValue({ ok: true });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);

    const select = await screen.findByLabelText("Conta para a pauta");
    expect(select.textContent).toContain("Trabalho 1 · 1.º trimestre · 10 valores");
    // Sem avaliação ligada, a nota da pauta não aparece na linha.
    expect(screen.getByRole("list", { name: "Entregas da turma" }).textContent).not.toContain(
      "na pauta",
    );
    fireEvent.change(select, { target: { value: item.id } });
    await waitFor(() =>
      expect(server.linkTaskAssessment).toHaveBeenCalledWith({
        data: { taskId: TASK, itemId: item.id },
      }),
    );
  });

  it("tarefa ligada: a linha mostra a nota na pauta e a nota máxima da avaliação", async () => {
    const item = {
      id: "00000000-0000-0000-0000-0000000000a1",
      name: "Trabalho 1",
      term: 1,
      maxScore: 10,
    };
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: item,
      assessmentOptions: [item],
      lines: [
        {
          enrollmentId: "e1",
          studentName: "Ana",
          submission: submission(),
          attempts: 1,
          pautaScore: 7,
        },
      ],
    });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);
    const list = await screen.findByRole("list", { name: "Entregas da turma" });
    expect(list.textContent).toContain("na pauta: 7");
    expect(screen.getByText(/fica em «Trabalho 1»/)).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Devolver" }));
    expect(screen.getByLabelText("Nota de Ana").getAttribute("placeholder")).toBe("0–10");
  });

  it("sem avaliações na disciplina: explica onde as criar", async () => {
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [],
      lines: [],
    });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);
    expect(await screen.findByText(/ainda não tem avaliações nesta turma/)).toBeTruthy();
  });

  it("configuração: edita o prazo e os atrasos, e arquiva", async () => {
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: "2026-11-01",
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [],
      lines: [],
    });
    server.updateTaskSettings.mockResolvedValue({ ok: true });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);

    const config = await screen.findByRole("region", { name: /Configuração do trabalho/ });
    expect(config.textContent).toContain("Trabalho · prazo");
    expect(config.textContent).toContain("aceita atrasos");
    fireEvent.click(within(config).getByRole("button", { name: "Editar" }));
    fireEvent.change(within(config).getByLabelText("Prazo"), { target: { value: "2026-11-10" } });
    fireEvent.click(within(config).getByRole("switch"));
    fireEvent.click(within(config).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(server.updateTaskSettings).toHaveBeenCalledWith({
        data: {
          taskId: TASK,
          title: "Resumo",
          kind: "trabalho",
          description: null,
          dueOn: "2026-11-10",
          acceptsLate: false,
          archived: false,
        },
      }),
    );

    fireEvent.click(within(config).getByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(server.updateTaskSettings).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ archived: true, dueOn: "2026-11-01" }),
      }),
    );
  });

  it("resumo da turma, filtro e histórico de tentativas de um aluno", async () => {
    const v1 = submission({ id: "sub-0", attempt: 1, body: "Primeira versão", is_late: false });
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [],
      lines: [
        {
          enrollmentId: "e1",
          studentName: "Ana Silva",
          submission: submission(),
          attempts: 2,
          history: [submission(), v1],
          pautaScore: null,
        },
        {
          enrollmentId: "e2",
          studentName: "Bia",
          submission: null,
          attempts: 0,
          history: [],
          pautaScore: null,
        },
      ],
    });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);

    const list = await screen.findByRole("list", { name: "Entregas da turma" });
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("Por devolver", { selector: "p" })).toBeTruthy();
    // Iniciais no avatar.
    expect(list.textContent).toContain("AS");

    fireEvent.click(screen.getByRole("button", { name: /Por entregar/ }));
    expect(within(list).queryByText("Ana Silva")).toBeNull();
    expect(within(list).getByText("Bia")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Todos/ }));

    fireEvent.click(within(list).getByRole("button", { name: "Ver as 2 tentativas" }));
    const attempts = screen.getByRole("list", { name: "Tentativas de Ana Silva" });
    expect(attempts.textContent).toContain("1.ª tentativa");
    expect(attempts.textContent).toContain("Primeira versão");
  });

  it("papel com foto: a foto vai com o registo da entrega", async () => {
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: null,
      assessmentOptions: [],
      lines: [
        { enrollmentId: "e2", studentName: "Bia", submission: null, attempts: 0, pautaScore: null },
      ],
    });
    server.recordPaperSubmission.mockResolvedValue({ attempt: 1 });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);
    const input = await screen.findByLabelText("Foto do trabalho em papel de Bia");
    fireEvent.change(input, {
      target: { files: [new File(["%PDF-1.4"], "folha.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() =>
      expect(server.recordPaperSubmission).toHaveBeenCalledWith({
        data: {
          taskId: TASK,
          enrollmentId: "e2",
          attachment: {
            name: "folha.pdf",
            contentType: "application/pdf",
            base64: btoa("%PDF-1.4"),
          },
        },
      }),
    );
  });

  it("notas devolvidas antes de ligar à pauta: um botão leva-as à pauta", async () => {
    const item = {
      id: "00000000-0000-0000-0000-0000000000a1",
      name: "Trabalho 1",
      term: 1,
      maxScore: 20,
    };
    const returned = (grade: number) => submission({ status: "returned", grade });
    server.listTaskSubmissions.mockResolvedValue({
      ...TASK_META,
      dueOn: null,
      acceptsLate: true,
      assessment: item,
      assessmentOptions: [item],
      lines: [
        // Na pauta com a mesma nota: não conta.
        {
          enrollmentId: "e1",
          studentName: "Ana",
          submission: returned(15),
          attempts: 1,
          pautaScore: 15,
        },
        // Nota 0 sem nota na pauta: conta (Number(null) também é 0).
        {
          enrollmentId: "e2",
          studentName: "Bia",
          submission: returned(0),
          attempts: 1,
          pautaScore: null,
        },
        {
          enrollmentId: "e3",
          studentName: "Caio",
          submission: returned(12),
          attempts: 1,
          pautaScore: 9,
        },
      ],
    });
    server.syncTaskGradesToPauta.mockResolvedValue({ saved: 2 });
    wrap(<TaskSubmissionsPanel taskId={TASK} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Lançar na pauta as 2 notas já devolvidas" }),
    );
    await waitFor(() =>
      expect(server.syncTaskGradesToPauta).toHaveBeenCalledWith({ data: { taskId: TASK } }),
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

  it("o aluno anexa um PDF e entrega só com o anexo", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: null,
      canSubmit: true,
      acceptsLate: true,
      dueOn: null,
    });
    server.submitTaskWork.mockResolvedValue({ attempt: 1, late: false });
    wrap(<MyTaskSubmission taskId={TASK} />);

    const input = await screen.findByLabelText("Anexar foto ou PDF");
    const file = new File(["%PDF-1.7 trabalho"], "caderno.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("caderno.pdf")).toBeTruthy();
    expect(screen.getByText("17 B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entregar" }));
    await waitFor(() =>
      expect(server.submitTaskWork).toHaveBeenCalledWith({
        data: {
          taskId: TASK,
          attachment: {
            name: "caderno.pdf",
            contentType: "application/pdf",
            base64: btoa("%PDF-1.7 trabalho"),
          },
        },
      }),
    );
  });

  it("um ficheiro de outro tipo é recusado no ecrã, antes de enviar", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: null,
      canSubmit: true,
      acceptsLate: true,
      dueOn: null,
    });
    wrap(<MyTaskSubmission taskId={TASK} />);
    const input = await screen.findByLabelText("Anexar foto ou PDF");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "virus.exe", { type: "application/x-msdownload" })] },
    });
    await waitFor(() => expect(screen.queryByText("virus.exe")).toBeNull());
    expect((screen.getByRole("button", { name: "Entregar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("o anexo entregue abre num separador, por URL assinado", async () => {
    server.getMyTaskSubmission.mockResolvedValue({
      submission: {
        id: "sub-9",
        attempt: 1,
        status: "submitted",
        submittedAt: "2026-11-01T10:00:00Z",
        isLate: false,
        onPaper: false,
        body: null,
        grade: null,
        feedback: null,
        returnedAt: null,
        file: { id: "f1", name: "caderno.jpg", mime: "image/jpeg", sizeBytes: 250_000 },
      },
      canSubmit: true,
      acceptsLate: true,
      dueOn: null,
    });
    server.openTaskSubmissionFile.mockResolvedValue({
      url: "https://signed/x",
      name: "caderno.jpg",
    });
    const tab = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    wrap(<MyTaskSubmission taskId={TASK} />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir anexo caderno.jpg" }));
    await waitFor(() => expect(tab.location.href).toBe("https://signed/x"));
    expect(server.openTaskSubmissionFile).toHaveBeenCalledWith({
      data: { taskId: TASK, submissionId: "sub-9" },
    });
    expect(screen.getByText("244 KB")).toBeTruthy();
    openSpy.mockRestore();
  });
});
