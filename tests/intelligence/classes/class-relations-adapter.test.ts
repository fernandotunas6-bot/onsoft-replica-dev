import { describe, expect, it } from "vitest";
import { mapClassGroupToSnapshot } from "@/features/intelligence/classes/class-relations-adapter";

const turma = {
  id: "turma-1",
  enrolled_count: 28,
  capacity: 30,
  average_score: 13.5,
  attendance_rate: 92,
};

describe("mapClassGroupToSnapshot", () => {
  it("maps a healthy class group", () => {
    const snapshot = mapClassGroupToSnapshot(
      turma,
      [{ teacher_name: "Ana" }, { teacher_name: "Bruno" }],
      4,
      12,
    );
    expect(snapshot.enrollment).toEqual({ count: 28, capacity: 30 });
    expect(snapshot.disciplinas).toEqual({ count: 2, semProfessorCount: 0 });
    expect(snapshot.horario).toEqual({ count: 4 });
    expect(snapshot.avaliacoes).toEqual({ count: 12 });
    expect(snapshot.academic).toEqual({ averageScore: 13.5, attendanceRate: 92 });
  });

  it("counts subjects without an assigned teacher", () => {
    const snapshot = mapClassGroupToSnapshot(
      turma,
      [{ teacher_name: "Ana" }, { teacher_name: null }, { teacher_name: null }],
      0,
      0,
    );
    expect(snapshot.disciplinas).toEqual({ count: 3, semProfessorCount: 2 });
  });
});
