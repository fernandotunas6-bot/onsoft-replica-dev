// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@/features/lesson-plans/server", () => ({
  createLessonPlan: vi.fn(),
  updateLessonPlan: vi.fn(),
}));
vi.mock("@/features/arquivos/PickFileButton", () => ({ PickFileButton: () => null }));

const { LessonPlanModal } = await import("@/features/lesson-plans/LessonPlanModal");

const classGroups = [
  { id: "7a", name: "7.ª A" },
  { id: "10c", name: "10.ª C" },
  { id: "8b", name: "8.ª B" },
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

function renderModal(initial: Parameters<typeof LessonPlanModal>[0]["initial"] = null) {
  return render(
    <LessonPlanModal
      open
      onOpenChange={() => {}}
      classGroups={classGroups}
      subjects={subjects}
      classSubjects={classSubjects}
      initial={initial}
      onSaved={() => {}}
    />,
  );
}

describe("plano de aula: disciplinas da turma", () => {
  afterEach(cleanup);

  it("mostra só as disciplinas da turma e acompanha a mudança de turma", () => {
    renderModal();
    expect(options()).toEqual(["Matemática", "Língua Portuguesa"]);
    expect(disciplina().value).toBe("mat");

    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "10c" } });
    expect(options()).toEqual(["Topografia"]);
    expect(disciplina().value).toBe("top");
  });

  it("turma sem disciplinas atribuídas: diz porquê e não deixa nenhuma escolhida", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "8b" } });
    expect(options()).toEqual(["Sem disciplinas atribuídas"]);
    expect(disciplina().value).toBe("");
  });

  it("editar um plano antigo com disciplina fora da turma mantém-na visível", () => {
    renderModal({ id: "p1", classGroupId: "7a", subjectId: "top", title: "Antigo" });
    expect(options()).toEqual(["Matemática", "Língua Portuguesa", "Topografia"]);
    expect(disciplina().value).toBe("top");
  });
});
