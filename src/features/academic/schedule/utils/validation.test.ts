import { describe, expect, it } from "vitest";
import { assertNoScheduleConflict, assertValidScheduleTime } from "./validation";
import type { ScheduleSlot } from "../types";

const base: ScheduleSlot = {
  id: "existing", class_group_id: "group-a", class_group_name: "A",
  weekday: 1, starts_at: "08:00:00", ends_at: "09:00:00",
  subject_id: "math", subject_name: "Matemática",
  teacher_id: "teacher-a", room_id: "room-a",
  label: null, display_label: "Matemática",
};

describe("validação dos horários", () => {
  it("rejeita dias e horas inválidos", () => {
    expect(() => assertValidScheduleTime(0, "08:00", "09:00")).toThrow();
    expect(() => assertValidScheduleTime(1, "25:00", "26:00")).toThrow();
    expect(() => assertValidScheduleTime(1, "09:00", "08:00")).toThrow();
    expect(() => assertValidScheduleTime(1, "08:00", "08:00")).toThrow();
    expect(() => assertValidScheduleTime(1, "08:00", "09:00")).not.toThrow();
  });

  it("bloqueia sobreposição da turma", () => {
    expect(() => assertNoScheduleConflict([base], {
      class_group_id: "group-a", teacher_id: "teacher-b", room_id: "room-b",
      weekday: 1, starts_at: "08:30", ends_at: "09:30",
    })).toThrow(/turma/);
  });

  it("bloqueia conflitos de docente ou sala mesmo entre turmas diferentes", () => {
    expect(() => assertNoScheduleConflict([base], {
      class_group_id: "group-b", teacher_id: "teacher-a", room_id: "room-b",
      weekday: 1, starts_at: "08:30", ends_at: "09:30",
    })).toThrow(/docente/);
    expect(() => assertNoScheduleConflict([base], {
      class_group_id: "group-b", teacher_id: "teacher-b", room_id: "room-a",
      weekday: 1, starts_at: "08:30", ends_at: "09:30",
    })).toThrow(/sala/);
  });

  it("permite editar o próprio slot sem autoconflito", () => {
    expect(() => assertNoScheduleConflict([base], {
      class_group_id: "group-a", teacher_id: "teacher-a", room_id: "room-a",
      weekday: 1, starts_at: "08:00", ends_at: "09:00",
    }, "existing")).not.toThrow();
  });

  it("permite aulas adjacentes", () => {
    expect(() => assertNoScheduleConflict([base], {
      class_group_id: "group-a", teacher_id: "teacher-a", room_id: "room-a",
      weekday: 1, starts_at: "09:00", ends_at: "10:00",
    })).not.toThrow();
  });
});
