import { describe, expect, it } from "vitest";
import { schoolTodayIso } from "./schoolClock";

describe("data institucional para presença docente", () => {
  it("usa o dia angolano após meia-noite local quando UTC ainda é anterior", () => {
    expect(schoolTodayIso(new Date("2026-09-23T23:30:00Z"))).toBe("2026-09-24");
  });
  it("preserva o dia correcto durante a jornada e noutras zonas configuradas", () => {
    expect(schoolTodayIso(new Date("2026-09-24T08:30:00Z"))).toBe("2026-09-24");
    expect(schoolTodayIso(new Date("2026-09-23T23:30:00Z"), "UTC")).toBe("2026-09-23");
  });
});
