import { describe, expect, it } from "vitest";
import { detectScheduleConflicts } from "./conflicts";
import type { ScheduleSlot } from "../types";

const slot = (id: string, overrides: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id,
  class_group_id: "class-a",
  class_group_name: "Turma A",
  weekday: 1,
  starts_at: "09:00:00",
  ends_at: "10:00:00",
  subject_id: "subject-a",
  subject_name: "Matemática",
  teacher_id: "teacher-a",
  teacher_name: "Professor A",
  room_id: "room-a",
  room_name: "Sala A",
  label: "Aula",
  display_label: "Matemática",
  ...overrides,
});

describe("detectScheduleConflicts", () => {
  it("detecta sobreposição de turma, docente e sala", () => {
    expect(detectScheduleConflicts([slot("a"), slot("b")]).map((c) => c.kind)).toEqual([
      "turma",
      "docente",
      "sala",
    ]);
  });

  it("aceita aulas adjacentes sem sobreposição", () => {
    expect(
      detectScheduleConflicts([
        slot("a"),
        slot("b", {
          starts_at: "10:00:00",
          ends_at: "11:00:00",
        }),
      ]),
    ).toEqual([]);
  });

  it("detecta sobreposição de apenas um segundo", () => {
    expect(
      detectScheduleConflicts([
        slot("a"),
        slot("b", {
          starts_at: "09:59:59",
          ends_at: "11:00:00",
        }),
      ]),
    ).toHaveLength(3);
  });

  it("não confunde etiquetas iguais com salas iguais", () => {
    const a = slot("a", {
      class_group_id: "a",
      teacher_id: "a",
      room_id: null,
      label: "Laboratório",
    });
    const b = slot("b", {
      class_group_id: "b",
      teacher_id: "b",
      room_id: null,
      label: "Laboratório",
    });
    expect(detectScheduleConflicts([a, b])).toEqual([]);
  });

  it("não mistura versões diferentes do horário", () => {
    expect(
      detectScheduleConflicts([slot("a", { schedule_id: "v1" }), slot("b", { schedule_id: "v2" })]),
    ).toEqual([]);
    expect(
      detectScheduleConflicts([slot("a", { schedule_id: "v1" }), slot("b", { schedule_id: "v1" })]),
    ).toHaveLength(3);
  });

  it("não mistura versão legada sem ID com versão identificada", () => {
    expect(
      detectScheduleConflicts([
        slot("legacy", { schedule_id: null }),
        slot("identified", { schedule_id: "v1" }),
      ]),
    ).toEqual([]);
  });

  it("não mistura dias diferentes", () => {
    expect(detectScheduleConflicts([slot("a"), slot("b", { weekday: 2 })])).toEqual([]);
  });
});
