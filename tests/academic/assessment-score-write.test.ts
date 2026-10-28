import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateAssessmentScoreBatch,
  writeAssessmentScores,
} from "@/features/academic/assessment-score-write";
import { memoryDb } from "../students/memory-db";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue(undefined),
  report: vi.fn(),
}));
vi.mock("@/features/academic/sga-grades", () => ({
  assertAssessmentTermNotLocked: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/audit/record-audit", () => ({
  recordAuditBatch: mocks.audit,
}));
vi.mock("@/lib/ops-report", () => ({
  reportSigaError: mocks.report,
}));

const SCHOOL = "escola-a";
const CLASS = "turma-a";
const ITEM = "prova-a";

type ScoreFixture = {
  id: string;
  item_id: string;
  school_id: string;
  enrollment_id: string;
  score: number | string | null;
};

function fixture(scores: ScoreFixture[] = []) {
  const store = memoryDb({
    school_settings: [{ school_id: SCHOOL, domain: "pedagogy", value: { closedTerms: [] } }],
    siga_assessment_items: [{
      id: ITEM,
      school_id: SCHOOL,
      class_group_id: CLASS,
      term: 1,
      max_score: 20,
    }],
    enrollments: [
      { id: "enr-a", school_id: SCHOOL, class_group_id: CLASS },
      { id: "enr-b", school_id: SCHOOL, class_group_id: CLASS },
    ],
    siga_assessment_scores: scores.map((score) => ({ ...score })),
  });
  const save = (
    rows: Array<{ enrollmentId: string; score: number | null }>,
    client = store.db,
  ) =>
    writeAssessmentScores(client, {
      schoolId: SCHOOL,
      userId: "professor-a",
      itemId: ITEM,
      rows,
    });
  return { ...store, save };
}

const existing = (
  id: string,
  enrollmentId: string,
  score: number | string | null,
): ScoreFixture => ({
  id,
  item_id: ITEM,
  school_id: SCHOOL,
  enrollment_id: enrollmentId,
  score,
});

beforeEach(() => vi.clearAllMocks());

describe("lote de notas — validação antes de gravar", () => {
  it("recusa notas duplicadas no mesmo lote", async () => {
    const store = fixture();
    await expect(
      store.save([
        { enrollmentId: "enr-a", score: 10 },
        { enrollmentId: "enr-a", score: 12 },
      ]),
    ).rejects.toThrow(/duas vezes/);
    expect(store.writes).toEqual([]);
  });

  it("recusa negativos, NaN, infinito e cotação acima do permitido", () => {
    for (const value of [-1, NaN, Infinity, -Infinity, 21]) {
      expect(() => validateAssessmentScoreBatch([{ enrollmentId: "enr-a", score: value }], 20))
        .toThrow(/entre 0 e 20/);
    }
    expect(() =>
      validateAssessmentScoreBatch([{ enrollmentId: "enr-a", score: 14 }], 10),
    ).toThrow(/10 valores/);
    expect(() =>
      validateAssessmentScoreBatch([{ enrollmentId: "enr-a", score: null }], 10),
    ).not.toThrow();
  });

  it("recusa alunos fora da turma antes de qualquer INSERT ou UPDATE", async () => {
    const store = fixture();
    await expect(store.save([{ enrollmentId: "enr-outra-turma", score: 12 }])).rejects.toThrow(
      /não são da turma/,
    );
    expect(store.writes).toEqual([]);
  });
});

describe("lote de notas — idempotência e concorrência", () => {
  it("repetir a mesma nota não escreve nem duplica auditoria", async () => {
    const store = fixture([existing("score-a", "enr-a", "12.5")]);
    expect(await store.save([{ enrollmentId: "enr-a", score: 12.5 }])).toEqual({ saved: 1 });
    expect(store.writes).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uma alteração grava previous_score e produz uma entrada de auditoria", async () => {
    const store = fixture([existing("score-a", "enr-a", 12)]);
    await store.save([{ enrollmentId: "enr-a", score: 13 }]);
    expect(store.tables["siga_assessment_scores"]?.[0]).toMatchObject({
      score: 13,
      previous_score: 12,
    });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        action: "grades.assessment_score_changed",
        metadata: expect.objectContaining({ from: 12, to: 13 }),
      }),
    ]);
  });

  it("rejeita a alteração de uma nota modificada por outra sessão", async () => {
    const store = fixture([existing("score-a", "enr-a", 12)]);
    const originalFrom = (
      store.db as unknown as {
        from: (table: string) => { update: (patch: Record<string, unknown>) => unknown };
      }
    ).from;
    const racedDb = {
      from(table: string) {
        const query = originalFrom(table);
        return new Proxy(query, {
          get(target, key) {
            if (table === "siga_assessment_scores" && key === "update") {
              return (patch: Record<string, unknown>) => {
                store.tables["siga_assessment_scores"]![0]!["score"] = 16;
                return target.update(patch);
              };
            }
            return Reflect.get(target, key);
          },
        });
      },
    };
    await expect(store.save([{ enrollmentId: "enr-a", score: 13 }], racedDb as never))
      .rejects.toThrow(/alterada por outra sessão/);
    expect(store.tables["siga_assessment_scores"]?.[0]?.["score"]).toBe(16);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.report).toHaveBeenCalled();
  });

  it("se uma nota falhar por concorrência, audita a outra que foi realmente gravada", async () => {
    const store = fixture([
      existing("score-a", "enr-a", 12),
      existing("score-b", "enr-b", 11),
    ]);
    const originalFrom = (
      store.db as unknown as {
        from: (table: string) => { update: (patch: Record<string, unknown>) => unknown };
      }
    ).from;
    const racedDb = {
      from(table: string) {
        const query = originalFrom(table);
        return new Proxy(query, {
          get(target, key) {
            if (table === "siga_assessment_scores" && key === "update") {
              return (patch: Record<string, unknown>) => {
                if (patch["score"] === 14) {
                  store.tables["siga_assessment_scores"]![1]!["score"] = 16;
                }
                return target.update(patch);
              };
            }
            return Reflect.get(target, key);
          },
        });
      },
    };
    await expect(
      store.save(
        [
          { enrollmentId: "enr-a", score: 13 },
          { enrollmentId: "enr-b", score: 14 },
        ],
        racedDb as never,
      ),
    ).rejects.toThrow(/alterada por outra sessão/);
    expect(store.tables["siga_assessment_scores"]?.[0]?.["score"]).toBe(13);
    expect(store.tables["siga_assessment_scores"]?.[1]?.["score"]).toBe(16);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        entityId: "score-a",
        metadata: expect.objectContaining({ from: 12, to: 13 }),
      }),
    ]);
  });

  it("nota ausente e zero são distintos, com CAS sobre NULL", async () => {
    const store = fixture([existing("score-a", "enr-a", null)]);
    await store.save([{ enrollmentId: "enr-a", score: 0 }]);
    expect(store.tables["siga_assessment_scores"]?.[0]).toMatchObject({
      score: 0,
      previous_score: null,
    });
    expect(mocks.audit.mock.calls[0]?.[0]?.[0]).toMatchObject({
      metadata: { from: null, to: 0 },
    });
  });
});
