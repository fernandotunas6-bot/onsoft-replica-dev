import { describe, expect, it } from "vitest";
import { academicContextLookup } from "@/features/intelligence/academic-context-lookup";
import {
  combineContextLookups,
  focusContextLookup,
  resolveContext,
  routeContextCandidates,
  subjectOfferingId,
} from "@/features/intelligence/context-resolver";
import type { EntityFocus } from "@/features/intelligence/types";
import { buildAcademicNavTree } from "@/lib/academic-nav";

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";
const PORTUGUES = "44444444-4444-4444-8444-444444444444";
const ALUNO = "55555555-5555-4555-8555-555555555555";

const tree = buildAcademicNavTree([
  {
    classGroupId: TURMA_A,
    className: "10.ª A",
    gradeName: "10.ª Classe",
    subjectId: MATEMATICA,
    subjectName: "Matemática",
  },
  {
    classGroupId: TURMA_B,
    className: "11.ª B",
    gradeName: "11.ª Classe",
    subjectId: PORTUGUES,
    subjectName: "Português",
  },
]);

describe("academicContextLookup", () => {
  const lookup = academicContextLookup(tree, "school-a");

  it("confirma turmas da árvore autorizada com o nome do servidor", () => {
    expect(lookup({ type: "class", id: TURMA_A })).toEqual({
      type: "class",
      id: TURMA_A,
      label: "10.ª A",
      schoolId: "school-a",
    });
    expect(lookup({ type: "class", id: ALUNO })).toBeNull();
  });

  it("confirma a disciplina só dentro da sua turma, com a turma como pai", () => {
    expect(
      lookup({ type: "subject-offering", id: subjectOfferingId(TURMA_A, MATEMATICA) }),
    ).toEqual({
      type: "subject-offering",
      id: subjectOfferingId(TURMA_A, MATEMATICA),
      label: "Matemática",
      schoolId: "school-a",
      parent: { type: "class", id: TURMA_A },
    });
    expect(
      lookup({ type: "subject-offering", id: subjectOfferingId(TURMA_A, PORTUGUES) }),
    ).toBeNull();
    expect(lookup({ type: "subject-offering", id: "lixo" })).toBeNull();
  });

  it("não confirma nada sem escola nem tipos que não conhece", () => {
    expect(academicContextLookup(tree, null)({ type: "class", id: TURMA_A })).toBeNull();
    expect(lookup({ type: "student", id: ALUNO })).toBeNull();
  });

  it("resolve o caminho completo da URL da Pedagógica", () => {
    const result = resolveContext({
      base: {
        userId: "u",
        role: "Professor",
        grants: {},
        pathname: "/pedagogica",
        focusedEntity: null,
      },
      schoolId: "school-a",
      academicYearId: null,
      route: routeContextCandidates("/pedagogica", { turma: TURMA_B, disciplina: PORTUGUES }),
      lookup,
    });
    expect(result.context.trail.map((frame) => frame.label)).toEqual(["11.ª B", "Português"]);
  });
});

describe("focusContextLookup e combineContextLookups", () => {
  const focus: EntityFocus = {
    type: "student",
    id: ALUNO,
    label: "Ana",
    schoolId: "school-a",
    data: { privado: true },
  };

  it("confirma só a entidade declarada, sem copiar os seus dados", () => {
    expect(focusContextLookup(focus)({ type: "student", id: ALUNO })).toEqual({
      type: "student",
      id: ALUNO,
      label: "Ana",
      schoolId: "school-a",
    });
    expect(focusContextLookup(focus)({ type: "teacher", id: ALUNO })).toBeNull();
    expect(focusContextLookup(null)({ type: "student", id: ALUNO })).toBeNull();
  });

  it("usa a primeira fonte que confirma", () => {
    const lookup = combineContextLookups(
      academicContextLookup(tree, "school-a"),
      focusContextLookup(focus),
    );
    expect(lookup({ type: "class", id: TURMA_A })?.label).toBe("10.ª A");
    expect(lookup({ type: "student", id: ALUNO })?.label).toBe("Ana");
    expect(lookup({ type: "teacher", id: ALUNO })).toBeNull();
  });

  it("o perfil do aluno resolve pela rota quando a página o declara", () => {
    const result = resolveContext({
      base: {
        userId: "u",
        role: "Secretaria",
        grants: {},
        pathname: `/alunos/${ALUNO}`,
        focusedEntity: focus,
      },
      schoolId: "school-a",
      academicYearId: null,
      route: routeContextCandidates(`/alunos/${ALUNO}`),
      focus,
      lookup: focusContextLookup(focus),
    });
    expect(result.source).toBe("route");
    expect(result.context.trail).toEqual([{ type: "student", id: ALUNO, label: "Ana" }]);
  });
});
