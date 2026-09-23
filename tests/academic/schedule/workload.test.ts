import { describe, expect, it } from "vitest";
import { getWeeklyScheduleCoverage } from "@/features/academic/schedule/utils/workload";
import type { ScheduleSlot } from "@/features/academic/schedule/types";

function slot(overrides: Partial<ScheduleSlot>): ScheduleSlot {
  return {
    id: "slot-1",
    class_group_id: "class-1",
    class_group_name: "10ª A",
    weekday: 1,
    starts_at: "08:00:00",
    ends_at: "09:00:00",
    subject_id: "subject-1",
    subject_name: "Matemática",
    teacher_id: "teacher-1",
    label: "Sala 1",
    display_label: "Matemática",
    ...overrides,
  };
}

describe("getWeeklyScheduleCoverage", () => {
  it("aponta apenas os tempos semanais ainda em falta", () => {
    const coverage = getWeeklyScheduleCoverage(
      [
        slot({ id: "slot-1" }),
        slot({ id: "slot-2", weekday: 3 }),
        slot({ id: "slot-3", subject_id: "subject-2", subject_name: "Português" }),
      ],
      [
        { class_group_id: "class-1", subject_id: "subject-1", weekly_periods: 3 },
        { class_group_id: "class-1", subject_id: "subject-2", weekly_periods: 1 },
      ],
      "class-1",
    );

    expect(coverage).toEqual([
      expect.objectContaining({ subjectId: "subject-1", plannedPeriods: 2, requiredPeriods: 3, missingPeriods: 1 }),
      expect.objectContaining({ subjectId: "subject-2", plannedPeriods: 1, requiredPeriods: 1, missingPeriods: 0 }),
    ]);
  });

  it("ignora disciplinas sem carga semanal configurada e outras turmas", () => {
    const coverage = getWeeklyScheduleCoverage(
      [slot({ class_group_id: "class-2" })],
      [
        { class_group_id: "class-1", subject_id: "subject-1", weekly_periods: 0 },
        { class_group_id: "class-2", subject_id: "subject-1", weekly_periods: 5 },
      ],
      "class-1",
    );

    expect(coverage).toEqual([]);
  });
});
