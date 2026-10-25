import { describe, expect, it } from "vitest";
import {
  contextKey,
  parseSubjectOfferingId,
  resolveContext,
  routeContextCandidates,
  subjectOfferingId,
  type ContextCandidate,
  type ValidatedEntity,
} from "@/features/intelligence/context-resolver";
import type { AppContext, EntityFocus } from "@/features/intelligence/types";

const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";
const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";
const ALUNO = "44444444-4444-4444-8444-444444444444";

const base: AppContext = {
  userId: "user-1",
  role: "Professor",
  grants: {},
  pathname: "/pedagogica",
  focusedEntity: null,
};

const turmaA: ValidatedEntity = {
  type: "class",
  id: TURMA_A,
  label: "Turma A",
  schoolId: SCHOOL_A,
};
const matematicaA: ValidatedEntity = {
  type: "subject-offering",
  id: subjectOfferingId(TURMA_A, MATEMATICA),
  label: "Matemática",
  schoolId: SCHOOL_A,
  parent: { type: "class", id: TURMA_A },
};

function lookupFrom(...entities: ValidatedEntity[]) {
  return (candidate: ContextCandidate) =>
    entities.find((e) => e.type === candidate.type && e.id === candidate.id) ?? null;
}

function resolve(
  route: ContextCandidate[],
  entities: ValidatedEntity[],
  extra: { focus?: EntityFocus | null; memory?: ContextCandidate[]; schoolId?: string } = {},
) {
  return resolveContext({
    base,
    schoolId: extra.schoolId ?? SCHOOL_A,
    academicYearId: "2026",
    route,
    focus: extra.focus,
    memory: extra.memory,
    lookup: lookupFrom(...entities),
  });
}

describe("routeContextCandidates", () => {
  it("lê turma e disciplina dos parâmetros tipados da Pedagógica", () => {
    expect(
      routeContextCandidates("/pedagogica", {
        tab: "notas",
        turma: TURMA_A,
        disciplina: MATEMATICA,
      }),
    ).toEqual([
      { type: "class", id: TURMA_A },
      { type: "subject-offering", id: `${TURMA_A}:${MATEMATICA}` },
    ]);
    expect(routeContextCandidates("/planos-aula", { turma: TURMA_A })).toEqual([
      { type: "class", id: TURMA_A },
    ]);
  });

  it("ignora a disciplina sem turma e ids mal formados", () => {
    expect(routeContextCandidates("/pedagogica", { disciplina: MATEMATICA })).toEqual([]);
    expect(routeContextCandidates("/pedagogica", { turma: "1 or 1=1" })).toEqual([]);
    expect(routeContextCandidates("/alunos/novo")).toEqual([]);
  });

  it("reconhece os perfis de aluno e professor, sem sub-rotas", () => {
    expect(routeContextCandidates(`/alunos/${ALUNO}`)).toEqual([{ type: "student", id: ALUNO }]);
    expect(routeContextCandidates(`/professores/${ALUNO}`)).toEqual([
      { type: "teacher", id: ALUNO },
    ]);
    expect(routeContextCandidates(`/alunos/${ALUNO}/extra`)).toEqual([]);
    expect(routeContextCandidates("/alunos")).toEqual([]);
  });
});

describe("parseSubjectOfferingId", () => {
  it("só aceita turma:disciplina com dois uuids", () => {
    expect(parseSubjectOfferingId(`${TURMA_A}:${MATEMATICA}`)).toEqual({
      classId: TURMA_A,
      subjectId: MATEMATICA,
    });
    expect(parseSubjectOfferingId(TURMA_A)).toBeNull();
    expect(parseSubjectOfferingId(`${TURMA_A}:${MATEMATICA}:x`)).toBeNull();
    expect(parseSubjectOfferingId("a:b")).toBeNull();
  });
});

describe("resolveContext", () => {
  it("(1) resolve Turma A → Matemática a partir da URL", () => {
    const result = resolve(
      routeContextCandidates("/pedagogica", { turma: TURMA_A, disciplina: MATEMATICA }),
      [turmaA, matematicaA],
    );
    expect(result.source).toBe("route");
    expect(result.refused).toBeNull();
    expect(result.context.trail.map((f) => f.label)).toEqual(["Turma A", "Matemática"]);
    expect(result.context.key).toBe(
      `${SCHOOL_A}|Professor|2026|class:${TURMA_A}|subject-offering:${TURMA_A}:${MATEMATICA}`,
    );
  });

  it("(3) acrescenta a turma quando a URL só traz a disciplina validada", () => {
    const result = resolve(
      [{ type: "subject-offering", id: matematicaA.id }],
      [turmaA, matematicaA],
    );
    expect(result.context.trail.map((f) => f.label)).toEqual(["Turma A", "Matemática"]);
  });

  it("nunca mistura a disciplina de uma turma com outra turma", () => {
    const turmaB: ValidatedEntity = { ...turmaA, id: TURMA_B, label: "Turma B" };
    const result = resolve(
      [
        { type: "class", id: TURMA_B },
        { type: "subject-offering", id: matematicaA.id },
      ],
      [turmaA, turmaB, matematicaA],
    );
    expect(result.context.trail.map((f) => f.label)).toEqual(["Turma B"]);
    expect(result.refused).toEqual({ type: "subject-offering", id: matematicaA.id });
  });

  it("um id que o servidor recusa deixa o contexto no nível acima, sem usar foco nem memória", () => {
    const focus: EntityFocus = {
      type: "student",
      id: ALUNO,
      label: "Ana",
      schoolId: SCHOOL_A,
      data: null,
    };
    const result = resolve([{ type: "class", id: TURMA_B }], [turmaA], {
      focus,
      memory: [{ type: "class", id: TURMA_A }],
    });
    expect(result.source).toBe("area");
    expect(result.context.trail).toEqual([]);
    expect(result.refused).toEqual({ type: "class", id: TURMA_B });
  });

  it("recusa entidades de outra escola, mesmo que a leitura as devolva", () => {
    const result = resolve([{ type: "class", id: TURMA_A }], [turmaA], { schoolId: SCHOOL_B });
    expect(result.context.trail).toEqual([]);
    expect(result.context.schoolId).toBe(SCHOOL_B);
    expect(result.context.key.startsWith(`${SCHOOL_B}|`)).toBe(true);
  });

  it("recusa uma leitura que devolve outra entidade", () => {
    const wrong = (candidate: ContextCandidate) => (candidate.id === TURMA_B ? turmaA : null);
    const result = resolveContext({
      base,
      schoolId: SCHOOL_A,
      academicYearId: null,
      route: [{ type: "class", id: TURMA_B }],
      lookup: wrong,
    });
    expect(result.context.trail).toEqual([]);
  });

  it("(2) usa a entidade declarada pela página quando a URL não tem contexto", () => {
    const focus: EntityFocus = {
      type: "class",
      id: TURMA_A,
      label: "Turma A",
      schoolId: SCHOOL_A,
      data: { x: 1 },
    };
    const result = resolve([], [], { focus });
    expect(result.source).toBe("focus");
    expect(result.context.trail).toEqual([{ type: "class", id: TURMA_A, label: "Turma A" }]);
  });

  it("ignora o foco de outra escola", () => {
    const focus: EntityFocus = {
      type: "class",
      id: TURMA_A,
      label: "Turma A",
      schoolId: SCHOOL_B,
      data: null,
    };
    expect(resolve([], [], { focus }).source).toBe("area");
  });

  it("(4) só restaura a memória que o servidor confirmar", () => {
    expect(resolve([], [turmaA], { memory: [{ type: "class", id: TURMA_A }] }).source).toBe(
      "memory",
    );
    expect(resolve([], [], { memory: [{ type: "class", id: TURMA_A }] }).source).toBe("area");
  });

  it("não entra em ciclo quando os pais se apontam mutuamente", () => {
    const a: ValidatedEntity = {
      ...turmaA,
      parent: { type: "subject-offering", id: matematicaA.id },
    };
    const result = resolve([{ type: "subject-offering", id: matematicaA.id }], [a, matematicaA]);
    expect(result.context.trail.map((f) => f.label)).toEqual(["Turma A", "Matemática"]);
  });

  it("muda a chave quando muda a escola, o papel ou o ano", () => {
    const trail = [{ type: "class" as const, id: TURMA_A, label: "Turma A" }];
    const keys = new Set([
      contextKey(SCHOOL_A, "Professor", "2026", trail),
      contextKey(SCHOOL_B, "Professor", "2026", trail),
      contextKey(SCHOOL_A, "Secretaria", "2026", trail),
      contextKey(SCHOOL_A, "Professor", "2027", trail),
    ]);
    expect(keys.size).toBe(4);
  });
});
