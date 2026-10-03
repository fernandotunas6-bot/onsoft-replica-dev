import { describe, expect, it } from "vitest";
import { detectScheduleConflicts } from "@/features/academic/schedule/utils/conflicts";
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
    teacher_name: "Ana",
    room_id: null,
    room_name: null,
    label: "Sala",
    display_label: "Matemática",
    ...overrides,
  };
}

describe("detectScheduleConflicts", () => {
  it("não cria falso conflito de sala por rótulo genérico", () => {
    const conflicts = detectScheduleConflicts([
      slot({ id: "slot-1", class_group_id: "class-1", teacher_id: "teacher-1" }),
      slot({
        id: "slot-2",
        class_group_id: "class-2",
        teacher_id: "teacher-2",
        label: "Sala",
        starts_at: "08:30:00",
        ends_at: "09:30:00",
      }),
    ]);

    expect(conflicts.filter((conflict) => conflict.kind === "sala")).toHaveLength(0);
  });

  it("mantém conflito quando a sala identificada é a mesma", () => {
    const conflicts = detectScheduleConflicts([
      slot({ id: "slot-1", room_id: "room-1", room_name: "Laboratório", label: "Laboratório" }),
      slot({
        id: "slot-2",
        class_group_id: "class-2",
        teacher_id: "teacher-2",
        room_id: "room-1",
        room_name: "Laboratório",
        label: "Laboratório",
        starts_at: "08:30:00",
        ends_at: "09:30:00",
      }),
    ]);

    expect(conflicts.some((conflict) => conflict.kind === "sala")).toBe(true);
  });
});
