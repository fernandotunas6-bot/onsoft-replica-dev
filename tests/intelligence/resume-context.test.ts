import { describe, expect, it } from "vitest";
import { pickResumeTarget } from "@/features/intelligence/resume-context";
import { subjectOfferingId } from "@/features/intelligence/context-resolver";

const TURMA = "11111111-1111-4111-8111-111111111111";
const MAT = "33333333-3333-4333-8333-333333333333";
const at = 0;

describe("pickResumeTarget", () => {
  it("escolhe o recente mais novo que abria uma turma ou disciplina", () => {
    const target = pickResumeTarget(
      [
        { path: "/pedagogica", label: "Pedagógica", search: "tab=turmas", at },
        {
          path: "/pedagogica",
          label: "Pedagógica",
          search: `tab=notas&turma=${TURMA}&disciplina=${MAT}`,
          at,
        },
        { path: "/planos-aula", label: "Planos", search: `turma=${TURMA}`, at },
      ],
      { path: "/pedagogica", search: { tab: "turmas" } },
    );
    expect(target).toEqual({
      path: "/pedagogica",
      search: { tab: "notas", turma: TURMA, disciplina: MAT },
      candidates: [
        { type: "class", id: TURMA },
        { type: "subject-offering", id: subjectOfferingId(TURMA, MAT) },
      ],
    });
  });

  it("reconhece a ficha e os trabalhos da turma", () => {
    expect(
      pickResumeTarget([{ path: `/pedagogica/turmas/${TURMA}`, label: "Turma", at }], {
        path: "/pedagogica",
        search: {},
      })?.candidates,
    ).toEqual([{ type: "class", id: TURMA }]);
    expect(
      pickResumeTarget(
        [{ path: "/pedagogica/trabalhos", label: "Trabalhos", search: `turma=${TURMA}`, at }],
        { path: "/pedagogica", search: {} },
      )?.path,
    ).toBe("/pedagogica/trabalhos");
  });

  it("ignora alunos, professores e ids mal formados", () => {
    expect(
      pickResumeTarget(
        [
          { path: `/alunos/${TURMA}`, label: "Aluno", at },
          { path: "/pedagogica", label: "Pedagógica", search: "tab=horarios&professor=" + MAT, at },
          { path: "/pedagogica", label: "Pedagógica", search: "turma=abc", at },
        ],
        { path: "/pedagogica", search: {} },
      ),
    ).toBeNull();
  });

  it("não oferece a turma em que já está", () => {
    expect(
      pickResumeTarget([{ path: "/pedagogica", label: "P", search: `turma=${TURMA}`, at }], {
        path: "/planos-aula",
        search: { turma: TURMA },
      }),
    ).toBeNull();
  });
});
