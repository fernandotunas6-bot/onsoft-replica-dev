import { describe, expect, it } from "vitest";
import { detectScheduleConflicts } from "@/features/academic/schedule/utils/conflicts";
import type { ScheduleSlot } from "@/features/academic/schedule/types";

const baseSlot: ScheduleSlot = {
  id: "slot-1",
  class_group_id: "group-1",
  class_group_name: "10A",
  weekday: 1,
  starts_at: "07:30:00",
  ends_at: "08:20:00",
  subject_id: "subject-1",
  subject_name: "Matemática",
  teacher_id: "teacher-1",
  label: "Sala 1",
  display_label: "Matemática",
};

describe("schedule conflicts", () => {
  it("detects overlapping class, teacher and room assignments", () => {
    const conflicts = detectScheduleConflicts([
      baseSlot,
      {
        ...baseSlot,
        id: "slot-2",
        starts_at: "08:00:00",
        ends_at: "08:50:00",
      },
    ]);

    expect(conflicts).toHaveLength(3);
  });

  it("ignores adjacent slots and distinct resources", () => {
    const conflicts = detectScheduleConflicts([
      baseSlot,
      {
        ...baseSlot,
        id: "slot-2",
        class_group_id: "group-2",
        class_group_name: "10B",
        teacher_id: "teacher-2",
        label: "Sala 2",
        starts_at: "08:20:00",
        ends_at: "09:10:00",
      },
    ]);

    expect(conflicts).toEqual([]);
  });
});
