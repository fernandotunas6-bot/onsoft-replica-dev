import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACADEMIC_SUBJECTS,
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
});
