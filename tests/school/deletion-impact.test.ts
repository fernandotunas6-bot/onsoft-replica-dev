import { describe, expect, it } from "vitest";
import {
  assessmentItemDeletionImpact,
  classGroupDeletionImpact,
  teacherDeletionImpact,
} from "@/features/school/deletion-impact";
import { memoryDb } from "../students/memory-db";

const S = "escola-a";

describe("impacto de eliminar/desactivar, contado no servidor", () => {
  it("turma com matrículas activas ou pendentes fica bloqueada; outras escolas não contam", async () => {
    const { db } = memoryDb({
      enrollments: [
        { school_id: S, class_group_id: "t1", status: "active" },
        { school_id: S, class_group_id: "t1", status: "pending" },
        { school_id: S, class_group_id: "t1", status: "cancelled" },
        { school_id: "escola-b", class_group_id: "t1", status: "active" },
      ],
      class_subjects: [{ school_id: S, class_group_id: "t1", status: "active" }],
      siga_assessment_items: [{ school_id: S, class_group_id: "t1" }],
    });
    const impact = await classGroupDeletionImpact(db, S, "t1");
    expect(impact.impacts).toEqual([
      { label: "matrícula(s) activa(s) ou pendente(s)", count: 2 },
      { label: "disciplina(s) com professor atribuído", count: 1 },
      { label: "avaliação(ões) — ficam no histórico", count: 1 },
    ]);
    expect(impact.blocker).toMatch(/matrículas activas/);
  });

  it("turma sem matrículas pode ser desactivada", async () => {
    const { db } = memoryDb({ enrollments: [], class_subjects: [], siga_assessment_items: [] });
    const impact = await classGroupDeletionImpact(db, S, "t1");
    expect(impact).toMatchObject({ impacts: [], blocker: null });
  });

  it("professor com disciplinas activas fica bloqueado", async () => {
    const { db } = memoryDb({
      class_subjects: [
        { school_id: S, teacher_id: "p1", status: "active" },
        { school_id: S, teacher_id: "p1", status: "inactive" },
      ],
    });
    const impact = await teacherDeletionImpact(db, S, "p1");
    expect(impact.impacts).toEqual([{ label: "disciplina(s) activa(s) atribuída(s)", count: 1 }]);
    expect(impact.blocker).toMatch(/Reatribua/);
  });

  it("avaliação conta só as notas lançadas", async () => {
    const { db } = memoryDb({
      siga_assessment_scores: [
        { school_id: S, item_id: "a1", score: 12 },
        { school_id: S, item_id: "a1", score: 0 },
        { school_id: S, item_id: "a1", score: null },
        { school_id: "escola-b", item_id: "a1", score: 10 },
      ],
    });
    const impact = await assessmentItemDeletionImpact(db, S, "a1");
    expect(impact.impacts).toEqual([{ label: "nota(s) lançada(s) serão eliminadas", count: 2 }]);
    expect(impact.blocker).toBeNull();
  });
});
