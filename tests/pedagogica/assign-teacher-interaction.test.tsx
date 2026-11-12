// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssignTeacherForm } from "@/features/pedagogica/components/AssignTeacherForm";

const { assignMock } = vi.hoisted(() => ({ assignMock: vi.fn() }));

vi.mock("@/features/academic/server", () => ({
  assignClassSubjectTeacher: assignMock,
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("atribuição de professor — diálogo compacto e seguro", () => {
  it("mantém o diálogo aberto e os dados enquanto o servidor processa", async () => {
    let finish!: () => void;
    assignMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onAssigned = vi.fn(async () => {});
    render(
      <AssignTeacherForm
        turmaOptions={["Turma A"]}
        subjectOptions={["Matemática"]}
        teacherOptions={["Professora Joana"]}
        turmaIds={["turma-a"]}
        subjectIds={["mat"]}
        teacherIds={["joana"]}
        onAssigned={onAssigned}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Professor" }));
    const dialog = screen.getByRole("dialog", { name: "Atribuir professor" });
    expect(dialog.className).toContain("max-w-md");
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "mat" } });
    fireEvent.change(screen.getByLabelText("Professor", { selector: "select" }), {
      target: { value: "joana" },
    });
    const submit = screen.getByRole("button", { name: "Atribuir professor" });
    fireEvent.click(submit);
    await waitFor(() => expect(assignMock).toHaveBeenCalledTimes(1));
    expect(assignMock).toHaveBeenCalledWith({
      data: { classGroupId: "turma-a", subjectId: "mat", teacherId: "joana" },
    });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Atribuir professor" })).toBeTruthy();
    expect(screen.queryByText("Alterações não guardadas")).toBeNull();
    expect(onAssigned).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Atribuir professor" })).toBeNull(),
    );
    expect(assignMock).toHaveBeenCalledOnce();
  });
});
