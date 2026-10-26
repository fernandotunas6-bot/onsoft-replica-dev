// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 20_000 });

const enrollStudentInClassMock = vi.fn();
const enrollNewStudentMock = vi.fn();

vi.mock("@/features/students/server", () => ({
  enrollStudentInClass: (args: unknown) => enrollStudentInClassMock(args),
  enrollNewStudent: (args: unknown) => enrollNewStudentMock(args),
}));
vi.mock("@/features/people/server", () => ({
  findPersonDuplicates: vi.fn().mockResolvedValue([]),
  searchPeople: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({ hasCapability: () => false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#ficha">{children}</a>,
}));

const { StudentEnrollmentSheet } = await import("@/features/students/StudentEnrollmentSheet");

const classGroups = [
  {
    id: "cg-8b",
    name: "B",
    grade_name: "8.ª Classe",
    course_name: "Ensino Geral",
    academic_year_id: "ay-2026",
    academic_year_name: "2026",
  },
];

describe("Nova matrícula de quem já é aluno", () => {
  afterEach(cleanup);

  it("oferece o aluno existente e matricula-o sem criar outro", async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    enrollStudentInClassMock.mockResolvedValue({ id: "enr-1" });
    render(
      <StudentEnrollmentSheet
        autoOpen
        trigger={() => null}
        classGroups={classGroups}
        people={[]}
        existingStudents={[
          {
            id: "st-1",
            full_name: "Ana Maria Gonçalves",
            registration_number: "2025-014",
            student_status: "active",
            class_name: "A",
            grade_name: "7.ª Classe",
            academic_year: "2025",
          },
        ]}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "ana goncalves" },
    });
    const list = screen.getByRole("list", { name: "Alunos existentes" });
    expect(within(list).getByText("Ana Maria Gonçalves")).toBeTruthy();
    expect(list.textContent).toContain("Nº 2025-014");
    expect(list.textContent).toContain("7.ª Classe · A");

    fireEvent.click(within(list).getByRole("button", { name: "Matricular este aluno" }));
    const turma = (await screen.findByLabelText("Turma")) as HTMLSelectElement;
    expect(turma.value).toBe("cg-8b");
    fireEvent.click(screen.getByRole("button", { name: "Matricular" }));

    await waitFor(() =>
      expect(enrollStudentInClassMock).toHaveBeenCalledWith({
        data: { studentId: "st-1", classGroupId: "cg-8b" },
      }),
    );
    expect(enrollNewStudentMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("nome novo: não mostra a lista", () => {
    render(
      <StudentEnrollmentSheet
        autoOpen
        trigger={() => null}
        classGroups={classGroups}
        people={[]}
        existingStudents={[{ id: "st-1", full_name: "Ana Maria Gonçalves" }]}
        onCreated={async () => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Pedro Neto" },
    });
    expect(screen.queryByRole("list", { name: "Alunos existentes" })).toBeNull();
  });
});
