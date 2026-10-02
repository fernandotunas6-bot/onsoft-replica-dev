import { describe, expect, it } from "vitest";
import { gridRows } from "./gridRows";
import type { ScheduleSlot } from "../types";

const slot = (
  id: string,
  weekday: number,
  starts_at = "08:00:00",
  ends_at = "09:00:00",
): ScheduleSlot => ({
  id,
  class_group_id: id,
  class_group_name: id,
  weekday,
  starts_at,
  ends_at,
  subject_id: id,
  subject_name: id,
  teacher_id: id,
  label: null,
  display_label: id,
});

describe("gridRows", () => {
  it("preserva aulas simultâneas no mesmo dia sem ocultar a segunda", () => {
    const rows = gridRows([slot("a", 1), slot("b", 1), slot("c", 2)]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cells[0]?.id)).toEqual(["a", "b"]);
    expect(rows[0]?.cells[1]?.id).toBe("c");
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it("não agrupa intervalos com a mesma hora inicial e fins diferentes", () => {
    const rows = gridRows([slot("a", 1), slot("b", 2, "08:00:00", "10:00:00")]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cells.filter(Boolean).length)).toEqual([1, 1]);
  });

  it("distingue intervalos separados por segundos", () => {
    const rows = gridRows([slot("a", 1), slot("b", 2, "08:00:30", "09:00:30")]);
    expect(rows).toHaveLength(2);
  });

  it("preserva aulas ao sábado e domingo", () => {
    const rows = gridRows([slot("sabado", 6), slot("domingo", 7)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells).toHaveLength(7);
    expect(rows[0]?.cells[5]?.id).toBe("sabado");
    expect(rows[0]?.cells[6]?.id).toBe("domingo");
  });

  it("devolve uma grelha vazia quando não há aulas", () => {
    expect(gridRows([])).toEqual([]);
  });
});
