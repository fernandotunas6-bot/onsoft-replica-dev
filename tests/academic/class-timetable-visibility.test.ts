import { describe, expect, it } from "vitest";
import {
  timetableDays,
  visibleTimetableSlots,
} from "@/features/academic/class-timetable-visibility";

const slots = [
  { id: "a", weekday: 1, starts_at: "07:00" },
  { id: "b", weekday: 1, starts_at: "08:00" },
  { id: "c", weekday: 3, starts_at: "07:00" },
  { id: "d", weekday: 5, starts_at: "07:00" },
];

describe("ficha da turma — horários por dia", () => {
  it("oferece só dias existentes, únicos e ordenados", () => {
    expect(timetableDays([slots[2], slots[0], slots[1], slots[3]])).toEqual([1, 3, 5]);
  });

  it("não inventa dias nem aceita números fora da semana", () => {
    expect(timetableDays([{ weekday: 9 }, { weekday: -1 }, { weekday: 2 }])).toEqual([2]);
  });

  it("o filtro por dia mostra todos os tempos desse dia", () => {
    const selection = visibleTimetableSlots(slots, 1, true);
    expect(selection.total).toBe(2);
    expect(selection.items.map((slot) => slot.id)).toEqual(["a", "b"]);
  });

  it("mantém os totais ao mostrar progressivamente sem alterar a origem", () => {
    const selection = visibleTimetableSlots(slots, "todos", false, 2);
    expect(selection.total).toBe(4);
    expect(selection.items.map((slot) => slot.id)).toEqual(["a", "b"]);
    expect(slots).toHaveLength(4);
  });

  it("mostrar todos e filtrar um dia sem tempos são distintos de ausência de horário", () => {
    expect(visibleTimetableSlots(slots, "todos", true).items).toHaveLength(4);
    expect(visibleTimetableSlots(slots, 4, true)).toEqual({ total: 0, items: [] });
    expect(visibleTimetableSlots([], "todos", false)).toEqual({ total: 0, items: [] });
  });
});
