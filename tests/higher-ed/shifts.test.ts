import { describe, expect, it } from "vitest";
import { NO_LAUNCH, canLaunchAny, defaultShift, shiftVisible } from "@/features/higher-ed/shifts";

describe("turnos das cadeiras", () => {
  it("o turno por omissão é a turma do estudante, se dá a cadeira", () => {
    expect(defaultShift(["A"], ["A", "B"])).toBe("A");
  });

  it("sem a turma do estudante, só escolhe quando há um único turno", () => {
    expect(defaultShift(["C"], ["B"])).toBe("B");
    expect(defaultShift(["C"], ["A", "B"])).toBeNull();
    expect(defaultShift([], [])).toBeNull();
  });

  it("a coordenação vê todos; o professor só os seus turnos e os sem turno", () => {
    const teacher = { all: false as const, groups: new Set(["A"]) };
    expect(shiftVisible({ all: true }, "B")).toBe(true);
    expect(shiftVisible(teacher, "A")).toBe(true);
    expect(shiftVisible(teacher, null)).toBe(true);
    expect(shiftVisible(teacher, "B")).toBe(false);
  });

  it("quem não dá a cadeira em nenhuma turma não lança", () => {
    expect(canLaunchAny(NO_LAUNCH)).toBe(false);
    expect(canLaunchAny({ all: true })).toBe(true);
    expect(canLaunchAny({ all: false, groups: new Set(["A"]) })).toBe(true);
  });
});
