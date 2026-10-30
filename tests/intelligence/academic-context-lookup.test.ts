import { describe, expect, it } from "vitest";
import { buildAppContext } from "@/features/intelligence/context-engine";
import { academicContextLookup } from "@/features/intelligence/academic-context-lookup";
import {
  resolveContext,
  routeContextCandidates,
  subjectOfferingId,
} from "@/features/intelligence/context-resolver";
import type { AcademicNavBranch } from "@/lib/academic-nav";
import type { EntityFocus } from "@/features/intelligence/types";

const SCHOOL_A = "school-a";
const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";
const FISICA = "44444444-4444-4444-8444-444444444444";

const tree: AcademicNavBranch[] = [
  {
    id: "grade:10",
    label: "10ª Classe",
    kind: "grade",
    classTeacher: false,
    classes: [
      {
        id: TURMA_A,
        name: "Turma A",
        classTeacher: false,
        subjects: [{ id: MATEMATICA, name: "Matemática" }],
      },
    ],
  },
];

const base = {
  userId: "u",
  role: "Professor",
  grants: {},
  pathname: "/pedagogica",
  focusedEntity: null,
};

function resolve(search: Record<string, unknown>, schoolId: string | null = SCHOOL_A) {
  return resolveContext({
    base,
    schoolId: SCHOOL_A,
    academicYearId: null,
    route: routeContextCandidates("/pedagogica", search),
    lookup: academicContextLookup(tree, schoolId),
  });
}

describe("academicContextLookup", () => {
  it("leva o professor que o servidor devolveu com a disciplina para o caminho", () => {
    const PROF = "66666666-6666-4666-8666-666666666666";
    const withTeacher: AcademicNavBranch[] = [
      {
        ...tree[0]!,
        classes: [
          {
            ...tree[0]!.classes[0]!,
            subjects: [{ id: MATEMATICA, name: "Matemática", teacherId: PROF }],
          },
        ],
      },
    ];
    const { context } = resolveContext({
      base,
      schoolId: SCHOOL_A,
      academicYearId: null,
      route: routeContextCandidates("/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      lookup: academicContextLookup(withTeacher, SCHOOL_A),
    });
    expect(context.trail.at(-1)?.relations).toEqual({ teacher: PROF });
    // A turma não tem professor próprio; sem professor atribuído, nenhuma relação.
    expect(context.trail[0]?.relations).toBeUndefined();
    expect(
      resolve({ turma: TURMA_A, disciplina: MATEMATICA }).context.trail.at(-1)?.relations,
    ).toBeUndefined();
  });

  it("dá o caminho Turma → Disciplina com rótulos do servidor", () => {
    const { context, source, refused } = resolve({ turma: TURMA_A, disciplina: MATEMATICA });
    expect(source).toBe("route");
    expect(refused).toBeNull();
    expect(context.trail.map((frame) => frame.label)).toEqual(["Turma A", "Matemática"]);
  });

  it("recusa uma disciplina que não é dada naquela turma", () => {
    const { context, refused } = resolve({ turma: TURMA_A, disciplina: FISICA });
    expect(context.trail.map((frame) => frame.label)).toEqual(["Turma A"]);
    expect(refused).toEqual({ type: "subject-offering", id: subjectOfferingId(TURMA_A, FISICA) });
  });

  it("recusa uma turma que o servidor não devolveu à conta", () => {
    const { context, source } = resolve({ turma: TURMA_B, disciplina: MATEMATICA });
    expect(context.trail).toEqual([]);
    expect(source).toBe("area");
  });

  it("sem escola activa não confirma nada", () => {
    expect(resolve({ turma: TURMA_A }, null).context.trail).toEqual([]);
  });

  it("ignora tipos que não são académicos", () => {
    const lookup = academicContextLookup(tree, SCHOOL_A);
    expect(lookup({ type: "student", id: TURMA_A })).toBeNull();
  });
});

describe("buildAppContext — isolamento por escola", () => {
  const focus: EntityFocus = {
    type: "student",
    id: "aluno-1",
    label: "Aluno",
    schoolId: SCHOOL_A,
    data: {},
  };
  it("descarta a entidade declarada por outra escola", () => {
    expect(
      buildAppContext({ ...base, focusedEntity: focus, schoolId: "school-b" }).focusedEntity,
    ).toBeNull();
  });
  it("mantém a entidade da escola activa", () => {
    expect(
      buildAppContext({ ...base, focusedEntity: focus, schoolId: SCHOOL_A }).focusedEntity?.id,
    ).toBe("aluno-1");
  });
});
