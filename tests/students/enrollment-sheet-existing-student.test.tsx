// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.setConfig({ testTimeout: 20_000 });

const searchEnrollmentStudentsMock = vi.hoisted(() => vi.fn());
const enrollStudentInClassMock = vi.fn();
const enrollNewStudentMock = vi.fn();

vi.mock("@/features/students/enrollment-student-search", () => ({
  searchEnrollmentStudents: searchEnrollmentStudentsMock,
}));
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

    fireEvent.click(screen.getByRole("button", { name: /Criar novo aluno/ }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "ana goncalves" },
    });
    const list = screen.getByRole("list", { name: "Alunos existentes" });
    expect(within(list).getByText("Ana Maria Gonçalves")).toBeTruthy();
    expect(list.textContent).toContain("Nº 2025-014");
    expect(list.textContent).toContain("7.ª Classe · A");

    fireEvent.click(within(list).getByRole("button", { name: "Matricular este aluno" }));
    const turma = (await screen.findByLabelText("Turma")) as HTMLSelectElement;
    expect(turma.value).toBe("");
    fireEvent.change(turma, { target: { value: "cg-8b" } });
    fireEvent.click(screen.getByRole("button", { name: "Matricular" }));

    await waitFor(() =>
      expect(enrollStudentInClassMock).toHaveBeenCalledWith({
        data: { studentId: "st-1", classGroupId: "cg-8b" },
      }),
    );
    expect(enrollNewStudentMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("mantém a turma de origem ao escolher um aluno já existente", async () => {
    render(
      <StudentEnrollmentSheet
        autoOpen
        initialClassGroupId="cg-target"
        trigger={() => null}
        classGroups={[...classGroups, { ...classGroups[0], id: "cg-target", name: "Destino" }]}
        people={[]}
        existingStudents={[{ id: "st-1", full_name: "Ana Maria Gonçalves" }]}
        onCreated={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar novo aluno/ }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "ana goncalves" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Matricular este aluno" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Turma") as HTMLSelectElement).value).toBe("cg-target"),
    );
  });

  it("pesquisa uma ficha que não está na lista carregada e conserva a turma", async () => {
    searchEnrollmentStudentsMock.mockResolvedValue([
      { id: "remote-student", full_name: "Ana Santos", registration_number: "1260099" },
    ]);
    render(
      <StudentEnrollmentSheet
        autoOpen
        initialClassGroupId="cg-target"
        trigger={() => null}
        classGroups={[...classGroups, { ...classGroups[0], id: "cg-target", name: "Destino" }]}
        people={[]}
        existingStudents={[]}
        onCreated={async () => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Procurar aluno existente/ }));
    fireEvent.change(screen.getByLabelText("Procurar aluno"), { target: { value: "1260099" } });
    fireEvent.click(await screen.findByRole("button", { name: "Seleccionar Ana Santos" }));
    expect(((await screen.findByLabelText("Turma")) as HTMLSelectElement).value).toBe("cg-target");
    expect(screen.queryByLabelText("Nome completo")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /Criar novo aluno/ }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Pedro Neto" },
    });
    expect(screen.queryByRole("list", { name: "Alunos existentes" })).toBeNull();
  });
});
