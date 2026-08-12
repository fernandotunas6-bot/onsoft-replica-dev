import { describe, expect, it } from "vitest";
import {
  assignClassSubjectTeacherInputSchema,
  unassignClassSubjectTeacherInputSchema,
  createScheduleSlotInputSchema,
  deleteScheduleSlotInputSchema,
  createSubjectInputSchema,
  updateSubjectInputSchema,
  deactivateSubjectInputSchema,
  getTeacherWorkspaceInputSchema,
  upsertTermGradeInputSchema,
  upsertTermGradesBatchInputSchema,
  createAssessmentInputSchema,
} from "@/features/academic/schemas";

describe("academic subject/grade schemas", () => {
  it("accepts a minimal subject", () => {
    const parsed = createSubjectInputSchema.parse({
      code: "QUI",
      name: "Química",
      weeklyHours: 4,
    });
    expect(parsed.name).toBe("Química");
    expect(parsed.teacherName).toBeUndefined();
  });

  it("exige id, código e nome para editar disciplina", () => {
    expect(updateSubjectInputSchema.safeParse({ name: "Química" }).success).toBe(false);
    const parsed = updateSubjectInputSchema.parse({
      subjectId: "11111111-1111-1111-1111-111111111111",
      code: "QUI",
      name: "Química Geral",
    });
    expect(parsed.code).toBe("QUI");
  });

  it("exige o id para desactivar disciplina", () => {
    expect(deactivateSubjectInputSchema.safeParse({}).success).toBe(false);
    expect(
      deactivateSubjectInputSchema.parse({
        subjectId: "11111111-1111-1111-1111-111111111111",
      }).subjectId,
    ).toHaveLength(36);
  });

  it("rejects inverted grade range at the application layer", () => {
    const parsed = createSubjectInputSchema.parse({
      code: "FIS",
      name: "Física",
      weeklyHours: 4,
      gradeFrom: 13,
      gradeTo: 10,
    });
    expect(parsed.gradeFrom).toBeGreaterThan(parsed.gradeTo!);
  });

  it("accepts term grades on the 0-20 scale", () => {
    const parsed = upsertTermGradeInputSchema.parse({
      enrollmentId: "11111111-1111-1111-1111-111111111111",
      subjectId: "22222222-2222-2222-2222-222222222222",
      term: 2,
      mac: 15,
      npp: 14,
      npt: 16,
    });
    expect(parsed.term).toBe(2);
  });

  it("rejects scores above 20", () => {
    const result = upsertTermGradeInputSchema.safeParse({
      enrollmentId: "11111111-1111-1111-1111-111111111111",
      subjectId: "22222222-2222-2222-2222-222222222222",
      term: 1,
      mac: 21,
      npp: 10,
      npt: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a pauta batch for one subject and term", () => {
    const parsed = upsertTermGradesBatchInputSchema.parse({
      subjectId: "22222222-2222-2222-2222-222222222222",
      term: 1,
      rows: [
        {
          enrollmentId: "11111111-1111-1111-1111-111111111111",
          mac: 12,
          npp: 11,
          npt: 13,
        },
      ],
    });
    expect(parsed.rows).toHaveLength(1);
  });

  it("accepts a classroom assessment that rolls into NPP", () => {
    const parsed = createAssessmentInputSchema.parse({
      classGroupId: "11111111-1111-1111-1111-111111111111",
      subjectId: "22222222-2222-2222-2222-222222222222",
      term: 2,
      name: "Teste de Matemática - Funções",
      kind: "teste",
      component: "NPP",
    });
    expect(parsed.countsTowardPauta).toBe(true);
    expect(parsed.maxScore).toBe(20);
  });
});

describe("academic schedule schemas", () => {
  it("requires subject or label", () => {
    const result = createScheduleSlotInputSchema.safeParse({
      classGroupId: "11111111-1111-1111-1111-111111111111",
      weekday: 1,
      startsAt: "07:30",
      endsAt: "08:20",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a labeled slot without subject", () => {
    const parsed = createScheduleSlotInputSchema.parse({
      classGroupId: "11111111-1111-1111-1111-111111111111",
      weekday: 5,
      startsAt: "11:20",
      endsAt: "12:10",
      label: "Direcção de turma",
    });
    expect(parsed.label).toBe("Direcção de turma");
  });

  it("exige o id do slot para remover", () => {
    expect(deleteScheduleSlotInputSchema.safeParse({}).success).toBe(false);
    expect(
      deleteScheduleSlotInputSchema.parse({ slotId: "11111111-1111-1111-1111-111111111111" })
        .slotId,
    ).toHaveLength(36);
  });
});

describe("teacher workspace schema", () => {
  it("accepts an empty lookup for the signed-in teacher", () => {
    const parsed = getTeacherWorkspaceInputSchema.parse({});
    expect(parsed.teacherId).toBeUndefined();
  });
});

describe("assignClassSubjectTeacherInputSchema", () => {
  it("exige turma, disciplina e professor", () => {
    expect(assignClassSubjectTeacherInputSchema.safeParse({}).success).toBe(false);
    const parsed = assignClassSubjectTeacherInputSchema.parse({
      classGroupId: "11111111-1111-1111-1111-111111111111",
      subjectId: "22222222-2222-2222-2222-222222222222",
      teacherId: "33333333-3333-3333-3333-333333333333",
    });
    expect(parsed.teacherId).toHaveLength(36);
  });
});

describe("unassignClassSubjectTeacherInputSchema", () => {
  it("exige turma e disciplina", () => {
    expect(unassignClassSubjectTeacherInputSchema.safeParse({}).success).toBe(false);
    const parsed = unassignClassSubjectTeacherInputSchema.parse({
      classGroupId: "11111111-1111-1111-1111-111111111111",
      subjectId: "22222222-2222-2222-2222-222222222222",
    });
    expect(parsed.subjectId).toHaveLength(36);
  });
});
