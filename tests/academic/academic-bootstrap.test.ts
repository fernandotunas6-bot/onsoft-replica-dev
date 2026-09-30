import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ACADEMIC_SUBJECTS,
  bootstrapAcademicYearIfMissing,
  defaultAcademicYearLabel,
} from "@/features/academic/academic-bootstrap";

describe("academic-bootstrap", () => {
  it("expõe cinco disciplinas por omissão", () => {
    expect(DEFAULT_ACADEMIC_SUBJECTS).toHaveLength(5);
    expect(DEFAULT_ACADEMIC_SUBJECTS.map((s) => s.code)).toEqual([
      "MAT",
      "PORT",
      "CN",
      "HIST",
      "ING",
    ]);
  });

  it("gera rótulo de ano lectivo a partir do ano corrente", () => {
    expect(defaultAcademicYearLabel(new Date(2026, 2, 15))).toBe("2026/2027");
    expect(defaultAcademicYearLabel(new Date(2025, 8, 1))).toBe("2025/2026");
  });

  it("não cria ano lectivo com datas inventadas quando o calendário está ausente", async () => {
    const insert = vi.fn();
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert,
    };
    const db = {
      from: vi.fn(() => query),
    };

    await expect(
      bootstrapAcademicYearIfMissing(
        db as never,
        { schoolId: "school-1", yearName: "2027/2028" },
        { strict: true },
      ),
    ).rejects.toThrow(/data de início e data de fim/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("o facade activo não contém datas fixas de trimestres demo", () => {
    const source = readFileSync("src/features/academic/academic-bootstrap.ts", "utf8");
    expect(source).not.toContain("2026-09-01");
    expect(source).not.toContain("2026-12-15");
    expect(source).not.toContain("2027-03-20");
    expect(source).not.toContain("2027-07-15");
    expect(source).not.toContain('yearName ?? "2026/2027"');
  });
});
