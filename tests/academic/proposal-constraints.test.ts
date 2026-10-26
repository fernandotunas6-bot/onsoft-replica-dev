import { describe, it, expect } from "vitest";
import type { ScheduleSlot } from "@/features/academic/schedule/types";
import { proposeTimetable } from "@/features/academic/schedule/utils/autoSchedule";
const input = {
  classGroupId: "c",
  classSubjects: [{ class_group_id: "c", subject_id: "math", teacher_id: "t", weekly_periods: 2 }],
  subjects: [{ id: "math", name: "Matemática" }],
  teachers: [{ id: "t", name: "Ana", max_weekly_hours: 1 }],
  slots: [],
  windows: [{ startsAt: "08:00", endsAt: "09:30" }],
  weekdays: [6],
  rooms: [{ id: "r", name: "Sala", code: "r", capacity: 30, room_type: "standard" }],
  minCapacity: 25,
};
const existingSlot = (overrides: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id: "old",
  class_group_id: "other",
  class_group_name: "Outra turma",
  weekday: 6,
  starts_at: "08:00",
  ends_at: "09:00",
  subject_id: "other",
  subject_name: "Outra",
  teacher_id: "other",
  room_id: null,
  room_name: null,
  label: null,
  display_label: "Aula",
  ...overrides,
});
const preciseInput = {
  ...input,
  teachers: [{ id: "t", name: "Ana" }],
  classSubjects: [{ ...input.classSubjects[0]!, weekly_periods: 1 }],
  windows: [{ startsAt: "08:00:00", endsAt: "09:00:00" }],
};
describe("proposta com recursos reais", () => {
  it("não ultrapassa carga docente em minutos", () => {
    expect(proposeTimetable(input).placements).toHaveLength(0);
  });
  it("não propõe sala sem lotação suficiente", () => {
    expect(
      proposeTimetable({ ...input, teachers: [{ id: "t", name: "Ana" }], minCapacity: 31 })
        .placements,
    ).toHaveLength(0);
  });
  it("não usa sala com lotação zero nem numa turma ainda vazia", () => {
    expect(
      proposeTimetable({
        ...input,
        minCapacity: 0,
        teachers: [{ id: "t", name: "Ana" }],
        rooms: [{ ...input.rooms[0]!, capacity: 0 }],
      }).placements,
    ).toEqual([]);
  });
  it("respeita sábado e limite diário configurável", () => {
    const result = proposeTimetable({
      ...input,
      teachers: [{ id: "t", name: "Ana" }],
      windows: [
        { startsAt: "08:00", endsAt: "08:45" },
        { startsAt: "08:45", endsAt: "09:30" },
      ],
      maxPerDay: 1,
    });
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]?.weekday).toBe(6);
  });
  it("sem grelha configurada não inventa aulas", () => {
    expect(proposeTimetable({ ...input, windows: [] }).placements).toEqual([]);
  });
  it("reconhece uma sala ocupada pelo nome legado, sem room_id", () => {
    const result = proposeTimetable({
      ...preciseInput,
      rooms: [{ ...input.rooms[0]!, name: "D101" }],
      slots: [existingSlot({ room_name: " d101 " })],
    });
    expect(result.placements).toEqual([]);
  });
  it("respeita o id da sala quando o rótulo legado diverge", () => {
    expect(
      proposeTimetable({
        ...preciseInput,
        rooms: [{ ...input.rooms[0]!, name: "D101" }],
        slots: [existingSlot({ room_id: "another-room", room_name: "D101" })],
      }).placements,
    ).toHaveLength(1);
  });
  it("detecta sobreposição de trinta segundos do professor", () => {
    expect(
      proposeTimetable({
        ...preciseInput,
        slots: [existingSlot({ teacher_id: "t", starts_at: "07:00:00", ends_at: "08:00:30" })],
      }).placements,
    ).toEqual([]);
  });
  it("aceita aulas contíguas sem transformar o limite em conflito", () => {
    expect(
      proposeTimetable({
        ...preciseInput,
        slots: [existingSlot({ teacher_id: "t", starts_at: "07:00:00", ends_at: "08:00:00" })],
      }).placements,
    ).toHaveLength(1);
  });
  it("conta os segundos na carga semanal do professor", () => {
    expect(
      proposeTimetable({ ...input, windows: [{ startsAt: "08:00:00", endsAt: "09:00:30" }] })
        .placements,
    ).toEqual([]);
  });
  it("não escolhe silenciosamente uma de várias versões da turma", () => {
    const result = proposeTimetable({
      ...preciseInput,
      slots: [
        existingSlot({ id: "v1", class_group_id: "c", schedule_id: "v1" }),
        existingSlot({ id: "v2", class_group_id: "c", schedule_id: "v2" }),
      ],
    });
    expect(result.placements).toEqual([]);
    expect(result.unplaced[0]?.reason).toMatch(/várias versões/);
  });
  it("recusa dias inválidos e grelhas sobrepostas", () => {
    expect(() => proposeTimetable({ ...preciseInput, weekdays: [8] })).toThrow(
      "Dia lectivo inválido",
    );
    expect(() =>
      proposeTimetable({
        ...preciseInput,
        windows: [
          { startsAt: "08:00", endsAt: "09:00" },
          { startsAt: "08:30", endsAt: "09:30" },
        ],
      }),
    ).toThrow("sobrepõem-se");
  });
  it("usa o rótulo explícito se o nome legado estiver vazio", () => {
    expect(
      proposeTimetable({
        ...preciseInput,
        rooms: [{ ...input.rooms[0]!, name: "D101" }],
        slots: [existingSlot({ room_name: "", label: "D101" })],
      }).placements,
    ).toEqual([]);
  });
});
