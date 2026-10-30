// @vitest-environment jsdom
/**
 * Pedagógica › Notas: o que o professor escreveu na pauta não se perde quando as
 * notas do servidor voltam a ser lidas, nem ao trocar de turma sem confirmar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    selectedTerm: { id: "t1", sequence: 1 },
    terms: [{ id: "t1", sequence: 1 }],
    setSelectedTermId: () => {},
    school: null,
  }),
}));
vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({ hasCapability: () => false }),
}));
vi.mock("@/features/school/server", () => ({ setTermLock: vi.fn() }));
vi.mock("@/features/academic/server", () => ({ upsertTermGradesBatch: vi.fn() }));
vi.mock("@/features/documents/print-issue-loader", () => ({ issuePrintDocument: vi.fn() }));
vi.mock("@/lib/export-pdf-loader", () => ({
  exportOfficialPautaPdf: vi.fn(),
  exportPdfTable: vi.fn(),
}));

const { GradePautaSheet } = await import("@/features/academic/GradePautaSheet");

const classGroups = [
  { id: "7a", name: "A", grade_name: "7.ª Classe" },
  { id: "7b", name: "B", grade_name: "7.ª Classe" },
];
const subjects = [{ id: "mat", name: "Matemática" }];
const classSubjects = [
  { class_group_id: "7a", subject_id: "mat" },
  { class_group_id: "7b", subject_id: "mat" },
];
const enrollments = [
  { id: "m-ana", student_name: "Ana", class_group_id: "7a", class_group_name: "A" },
  { id: "m-rui", student_name: "Rui", class_group_id: "7a", class_group_name: "A" },
];
type Grade = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
};

function sheet(termGrades: Grade[]) {
  return (
    <GradePautaSheet
      schoolName="Escola Teste"
      academicYear="2026"
      classGroups={classGroups}
      subjects={subjects}
      classSubjects={classSubjects}
      enrollments={enrollments}
      termGrades={termGrades}
      canLaunch
    />
  );
}

function renderSheet(termGrades: Grade[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>{sheet(termGrades)}</QueryClientProvider>,
  );
  return {
    rerenderWith: (grades: Grade[]) =>
      view.rerender(<QueryClientProvider client={client}>{sheet(grades)}</QueryClientProvider>),
  };
}

const macOf = (name: string) => screen.getAllByLabelText(`MAC de ${name}`)[0] as HTMLInputElement;

describe("pauta: rascunhos de notas protegidos", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("nova leitura do servidor actualiza as outras linhas e mantém a que foi escrita", () => {
    const view = renderSheet();
    fireEvent.change(macOf("Ana"), { target: { value: "14" } });
    view.rerenderWith([
      { enrollment_id: "m-ana", subject_id: "mat", term: 1, mac: 9, npp: 9, npt: 9 },
      { enrollment_id: "m-rui", subject_id: "mat", term: 1, mac: 12, npp: 12, npt: 12 },
    ]);
    expect(macOf("Ana").value).toBe("14");
    expect(macOf("Rui").value).toBe("12");
  });

  it("trocar de turma com notas por gravar pede confirmação e, recusada, fica tudo", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSheet();
    fireEvent.change(macOf("Ana"), { target: { value: "14" } });
    fireEvent.change(screen.getAllByLabelText("NPP de Ana")[0]!, { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "7b" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Turma") as HTMLSelectElement).value).toBe("7a");
    expect(macOf("Ana").value).toBe("14");
  });

  it("sem nada escrito, troca de turma sem perguntar", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderSheet();
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "7b" } });
    expect(confirm).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Turma") as HTMLSelectElement).value).toBe("7b");
  });

  it("fechar o separador com notas por gravar mostra o aviso do navegador", () => {
    renderSheet();
    fireEvent.change(macOf("Ana"), { target: { value: "14" } });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
