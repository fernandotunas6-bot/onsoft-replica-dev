// @vitest-environment jsdom
/**
 * Pedagógica › Notas: o campo «Disciplina» da pauta listava o catálogo inteiro
 * da escola para qualquer turma. Só os hooks de contexto e o servidor são simulados.
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
  { id: "10c", name: "C", grade_name: "10.ª Classe" },
  { id: "8b", name: "B", grade_name: "8.ª Classe" },
];
const subjects = [
  { id: "mat", name: "Matemática" },
  { id: "por", name: "Língua Portuguesa" },
  { id: "top", name: "Topografia" },
];
const classSubjects = [
  { class_group_id: "7a", subject_id: "mat" },
  { class_group_id: "7a", subject_id: "por" },
  { class_group_id: "10c", subject_id: "top" },
];

const disciplina = () => screen.getByLabelText("Disciplina") as HTMLSelectElement;
const options = () => Array.from(disciplina().options).map((option) => option.text);

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GradePautaSheet
        schoolName="Escola Teste"
        academicYear="2026"
        classGroups={classGroups}
        subjects={subjects}
        classSubjects={classSubjects}
        enrollments={[]}
        termGrades={[]}
        canLaunch
      />
    </QueryClientProvider>,
  );
}

describe("pauta: disciplinas da turma seleccionada", () => {
  afterEach(cleanup);

  it("mostra só as disciplinas da turma e acompanha a mudança de turma", () => {
    renderSheet();
    expect(options()).toEqual(["Matemática", "Língua Portuguesa"]);

    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "10c" } });
    expect(options()).toEqual(["Topografia"]);
    expect(disciplina().value).toBe("top");
  });

  it("turma sem disciplinas: não fica a disciplina da turma anterior", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "8b" } });
    expect(options()).toEqual(["Sem disciplinas atribuídas"]);
    expect(disciplina().value).toBe("");
  });
});
