import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.fn();
const locked = vi.fn();
const report = vi.fn();
vi.mock("@/features/academic/sga-grades", () => ({
  assertAssessmentTermNotLocked: (...args: unknown[]) => locked(...args),
}));
vi.mock("@/lib/ops-report", () => ({ reportSigaError: (...args: unknown[]) => report(...args) }));
let invalidStudent = false;
const db = {
  rpc,
  from(table: string) {
    const data =
      table === "siga_assessment_items"
        ? { id: "item", term: 1, class_group_id: "class", max_score: 20 }
        : table === "school_settings"
          ? { value: {} }
          : invalidStudent
            ? []
            : [{ id: "e1" }];
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
    };
    return chain;
  },
};
const { writeAssessmentScores } = await import("@/features/academic/assessment-score-write");
const input = {
  schoolId: "school",
  userId: "teacher",
  itemId: "item",
  rows: [{ enrollmentId: "e1", score: 0 }],
};
beforeEach(() => {
  rpc.mockReset();
  locked.mockReset();
  report.mockReset();
  invalidStudent = false;
  rpc.mockResolvedValue({ data: 1, error: null });
});
describe("contrato transaccional das notas", () => {
  it("envia zero intacto para uma única RPC", async () => {
    expect(await writeAssessmentScores(db as never, input)).toEqual({ saved: 1 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("siga_write_assessment_scores_atomic", {
      p_school_id: "school",
      p_actor_user_id: "teacher",
      p_item_id: "item",
      p_rows: input.rows,
    });
  });
  it("recusa aluno de outra turma e pauta fechada antes de chamar a RPC", async () => {
    invalidStudent = true;
    await expect(writeAssessmentScores(db as never, input)).rejects.toThrow("turma");
    expect(rpc).not.toHaveBeenCalled();
    invalidStudent = false;
    locked.mockRejectedValue(new Error("Pauta fechada"));
    await expect(writeAssessmentScores(db as never, input)).rejects.toThrow("fechada");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sem migração recusa e não volta ao caminho de escritas separadas", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    await expect(writeAssessmentScores(db as never, input)).rejects.toThrow(
      "actualização académica",
    );
    expect(report).toHaveBeenCalledOnce();
  });
  it("resposta incompleta não confirma sucesso", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    await expect(writeAssessmentScores(db as never, input)).rejects.toThrow("confirmar");
  });
});
