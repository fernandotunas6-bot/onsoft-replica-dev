import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/audit/record-audit", () => ({ recordAuditBatch: vi.fn() }));
vi.mock("@/lib/ops-report", () => ({ reportSigaError: vi.fn() }));
vi.mock("@/features/academic/sga-grades", () => ({ assertAssessmentTermNotLocked: vi.fn() }));

import {
  AssessmentScoresError,
  recordAssessmentScores,
} from "@/features/academic/assessment-scores-core.server";

const school = "11111111-1111-4111-8111-111111111111";
const item = "33333333-3333-4333-8333-333333333333";
const enrollment = "44444444-4444-4444-8444-444444444444";
let writes: string[];
let stored: { id: string; score: number; enrollment_id: string; updated_at: string }[];

function table(name: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
  chain.insert = () => (writes.push(name + ".insert"), Promise.resolve({ error: null }));
  chain.update = () => (writes.push(name + ".update"), chain);
  const data =
    name === "siga_assessment_items"
      ? { id: item, term: 1, class_group_id: "group-1", max_score: 20 }
      : name === "school_settings"
        ? null
        : name === "enrollments"
          ? [{ id: enrollment }]
          : stored;
  chain.maybeSingle = () => Promise.resolve({ data, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
  return chain;
}
const db = { from: table } as never;
const actor = { schoolId: school, userId: "teacher-user" };
const rows = [{ enrollmentId: enrollment, score: 15 }];

beforeEach(() => {
  writes = [];
  stored = [
    { id: "s1", score: 10, enrollment_id: enrollment, updated_at: "2026-10-10T09:00:00+00:00" },
  ];
});

describe("núcleo das notas de avaliação", () => {
  it("recusa sobrescrever uma nota alterada depois de o professor a ver", async () => {
    await expect(
      recordAssessmentScores(
        db,
        actor,
        { itemId: item, rows },
        {
          expectedUpdatedAt: new Map([[enrollment, "2026-10-10T08:00:00.000Z"]]),
        },
      ),
    ).rejects.toBeInstanceOf(AssessmentScoresError);
    expect(writes).toEqual([]);
  });

  it("aceita a mesma versão (formatos de data diferentes) e grava", async () => {
    await expect(
      recordAssessmentScores(
        db,
        actor,
        { itemId: item, rows },
        {
          expectedUpdatedAt: new Map([[enrollment, "2026-10-10T09:00:00.000Z"]]),
        },
      ),
    ).resolves.toEqual({ saved: 1 });
    expect(writes).toEqual(["siga_assessment_scores.update"]);
  });

  it("nota nova: a versão vista tem de ser nenhuma", async () => {
    stored = [];
    await expect(
      recordAssessmentScores(
        db,
        actor,
        { itemId: item, rows },
        {
          expectedUpdatedAt: new Map([[enrollment, null]]),
        },
      ),
    ).resolves.toEqual({ saved: 1 });
    expect(writes).toEqual(["siga_assessment_scores.insert"]);
  });

  it("o portal (sem versão) grava como antes", async () => {
    await expect(recordAssessmentScores(db, actor, { itemId: item, rows })).resolves.toEqual({
      saved: 1,
    });
  });

  it("nota acima da cotação recusada antes de gravar", async () => {
    await expect(
      recordAssessmentScores(db, actor, {
        itemId: item,
        rows: [{ enrollmentId: enrollment, score: 21 }],
      }),
    ).rejects.toMatchObject({ code: "ABOVE_MAX" });
    expect(writes).toEqual([]);
  });
});
