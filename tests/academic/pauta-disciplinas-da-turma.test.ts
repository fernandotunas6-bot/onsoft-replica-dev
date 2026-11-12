import { describe, expect, it } from "vitest";
import { subjectsOfClass } from "@/features/academic/pauta-subjects";

const catalogo = [
  { id: "mat", name: "Matemática" },
  { id: "por", name: "Língua Portuguesa" },
  { id: "top", name: "Topografia" },
];
const turmas = [
  { class_group_id: "7a", subject_id: "mat" },
  { class_group_id: "7a", subject_id: "por" },
  { class_group_id: "10c", subject_id: "top" },
];

describe("disciplinas da turma seleccionada", () => {
  it("mostra só as disciplinas da turma", () => {
    expect(subjectsOfClass(catalogo, turmas, "7a").map((s) => s.id)).toEqual(["mat", "por"]);
    expect(subjectsOfClass(catalogo, turmas, "10c").map((s) => s.id)).toEqual(["top"]);
  });

  it("turma sem disciplinas atribuídas: lista vazia, nunca o catálogo da escola", () => {
    expect(subjectsOfClass(catalogo, turmas, "8b")).toEqual([]);
    expect(subjectsOfClass(catalogo, [], "7a")).toEqual([]);
  });

  it("ligação a uma disciplina inactiva (fora do catálogo) não aparece", () => {
    expect(subjectsOfClass(catalogo, [{ class_group_id: "9a", subject_id: "geo" }], "9a")).toEqual(
      [],
    );
  });
});
