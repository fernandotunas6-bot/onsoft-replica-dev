import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AssessmentScoresError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    AssessmentScoresError,
    access: vi.fn(),
    scope: vi.fn(),
    catalog: vi.fn(),
    record: vi.fn(),
    tables: {} as Record<string, { data: unknown; error: unknown }>,
    queries: [] as Array<[string, ...unknown[]]>,
  };
});

function query(table: string) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order", "limit"]) {
    chain[name] = (...args: unknown[]) => {
      mocks.queries.push([table + "." + name, ...args]);
      return chain;
    };
  }
  const result = () => mocks.tables[table] ?? { data: [], error: null };
  chain.maybeSingle = () => Promise.resolve(result());
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result());
  return chain;
}
const db = { from: (table: string) => query(table) };

vi.mock("@/features/mobile-v4/authorization", () => ({
  requireMobileAcademicAccess: mocks.access,
}));
vi.mock("@/features/mobile-v4/academic-scope.server", () => ({
  resolveMobileAcademicScope: mocks.scope,
}));
vi.mock("@/features/mobile-v4/academic-catalog.server", () => ({
  readMobileAcademicCatalog: mocks.catalog,
}));
vi.mock("@/features/academic/assessment-scores-core.server", () => ({
  recordAssessmentScores: mocks.record,
  AssessmentScoresError: mocks.AssessmentScoresError,
}));

import {
  loadMobileV4Assessments,
  recordMobileV4Scores,
} from "@/features/mobile-v4/teacher-scores.server";

const school = "11111111-1111-4111-8111-111111111111";
const item = "33333333-3333-4333-8333-333333333333";
const enrollment = "44444444-4444-4444-8444-444444444444";
const requestId = "22222222-2222-4222-8222-222222222222";
const seen = "2026-10-10T08:00:00.000Z";

const save = (score: number | null = 14, expectedUpdatedAt: string | null = seen) =>
  recordMobileV4Scores("teacher-user", {
    schoolId: school,
    role: "professor",
    requestId,
    command: {
      type: "scores",
      itemId: item,
      entries: [{ enrollmentId: enrollment, score, expectedUpdatedAt }],
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.tables = {};
  mocks.access.mockResolvedValue({ db });
  mocks.scope.mockResolvedValue({ schoolId: school, role: "professor", teacherId: "teacher-1" });
  mocks.catalog.mockResolvedValue({
    classes: [{ classSubjectId: "cs-1", classGroupId: "group-1", subjectId: "math" }],
  });
});

describe("avaliações do professor", () => {
  it("só o papel professor", async () => {
    await expect(
      loadMobileV4Assessments("user", { schoolId: school, role: "aluno" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("devolve só as avaliações do par turma × disciplina atribuído, com a versão das notas", async () => {
    mocks.tables.siga_assessment_items = {
      data: [
        {
          id: item,
          class_group_id: "group-1",
          subject_id: "math",
          term: 1,
          name: "Teste 1",
          kind: "test",
          assessed_on: "2026-10-01",
          max_score: 20,
        },
        // Turma do professor, mas disciplina de outro par: fica de fora.
        {
          id: "other",
          class_group_id: "group-1",
          subject_id: "physics",
          term: 1,
          name: "X",
          kind: "test",
          assessed_on: null,
          max_score: null,
        },
      ],
      error: null,
    };
    mocks.tables.siga_assessment_scores = {
      data: [{ item_id: item, enrollment_id: enrollment, score: "12.5", updated_at: seen }],
      error: null,
    };
    const result = await loadMobileV4Assessments("teacher-user", {
      schoolId: school,
      role: "professor",
    });
    expect(result).toEqual({
      schoolId: school,
      items: [
        {
          id: item,
          classSubjectId: "cs-1",
          term: 1,
          name: "Teste 1",
          kind: "test",
          assessedOn: "2026-10-01",
          maxScore: 20,
          scores: [{ enrollmentId: enrollment, score: 12.5, updatedAt: seen }],
        },
      ],
    });
    expect(mocks.queries).toContainEqual(["siga_assessment_items.eq", "school_id", school]);
  });
});

describe("comando de notas", () => {
  beforeEach(() => {
    mocks.tables.siga_assessment_items = {
      data: { id: item, class_group_id: "group-1", subject_id: "math" },
      error: null,
    };
    mocks.tables.class_subjects = { data: [{ id: "cs-1" }], error: null };
  });

  it("grava pelo núcleo do portal com a versão que o professor viu", async () => {
    mocks.record.mockResolvedValue({ saved: 1 });
    await expect(save()).resolves.toEqual({ ok: true, saved: 1 });
    expect(mocks.access).toHaveBeenCalledWith("teacher-user", school, "professor", "write");
    const [, actor, data, options] = mocks.record.mock.calls[0];
    expect(actor).toEqual({ schoolId: school, userId: "teacher-user" });
    expect(data).toEqual({ itemId: item, rows: [{ enrollmentId: enrollment, score: 14 }] });
    expect(options.expectedUpdatedAt.get(enrollment)).toBe(seen);
    expect(mocks.queries).toContainEqual(["class_subjects.eq", "teacher_id", "teacher-1"]);
  });

  it("recusa avaliação de disciplina que não é do professor, antes de gravar", async () => {
    mocks.tables.class_subjects = { data: [], error: null };
    await expect(save()).rejects.toMatchObject({ status: 403, code: "NOT_SUBJECT_TEACHER" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("avaliação inexistente nesta escola → 404", async () => {
    mocks.tables.siga_assessment_items = { data: null, error: null };
    await expect(save()).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["STALE", 409],
    ["ABOVE_MAX", 422],
    ["NOT_IN_CLASS", 422],
    ["ITEM_NOT_FOUND", 404],
  ])("traduz %s em %i", async (code, status) => {
    mocks.record.mockRejectedValue(new mocks.AssessmentScoresError(code, "interno"));
    await expect(save()).rejects.toMatchObject({ status, code });
  });

  it("período fechado ou pauta oficial → 409 sem detalhes; outro erro sobe", async () => {
    mocks.record.mockRejectedValue(new Error("O 1º trimestre está fechado."));
    await expect(save()).rejects.toMatchObject({ status: 409, code: "PERIOD_LOCKED" });
    mocks.record.mockRejectedValue(new Error("db down"));
    await expect(save()).rejects.toThrow("db down");
  });
});
