import { describe, expect, it } from "vitest";
import { computeMastery, normalizeScore } from "@/features/academic/competency-mastery";

describe("domínio de competências", () => {
  it("converte para a escala da escola", () => {
    expect(normalizeScore(5, 10, 20)).toBe(10);
    expect(normalizeScore(15, null, 20)).toBe(15);
    expect(normalizeScore(40, 50, 20)).toBe(16);
  });

  it("dominada quando a média das avaliações ligadas atinge a aprovação", () => {
    const result = computeMastery({
      competencyIds: ["c1", "c2", "c3"],
      enrollmentIds: ["ana", "bruno"],
      items: [
        { itemId: "t1", maxScore: 20 },
        { itemId: "t2", maxScore: 10 },
      ],
      links: [
        { itemId: "t1", competencyId: "c1" },
        { itemId: "t2", competencyId: "c1" },
        { itemId: "t2", competencyId: "c2" },
        { itemId: "fora", competencyId: "c2" },
      ],
      scores: [
        { itemId: "t1", enrollmentId: "ana", score: 12 },
        { itemId: "t2", enrollmentId: "ana", score: 4 },
        { itemId: "t1", enrollmentId: "bruno", score: 6 },
        { itemId: "t2", enrollmentId: "bruno", score: null },
      ],
      passing: 10,
      scaleMax: 20,
    });
    const ana = result.students.find((s) => s.enrollmentId === "ana")!;
    // c1 = (12 + 8)/2 = 10 → dominada; c2 = 8 → não; c3 sem avaliações → por avaliar.
    expect(ana.competencies.map((c) => [c.competencyId, c.average, c.mastered])).toEqual([
      ["c1", 10, true],
      ["c2", 8, false],
      ["c3", null, null],
    ]);
    expect(ana).toMatchObject({ assessed: 2, mastered: 1, percentage: 50 });

    const bruno = result.students.find((s) => s.enrollmentId === "bruno")!;
    expect(bruno).toMatchObject({ assessed: 1, mastered: 0, percentage: 0 });

    expect(result.competencies).toEqual([
      {
        competencyId: "c1",
        assessedStudents: 2,
        masteredStudents: 1,
        percentage: 50,
        linkedItems: 2,
      },
      {
        competencyId: "c2",
        assessedStudents: 1,
        masteredStudents: 0,
        percentage: 0,
        linkedItems: 1,
      },
      {
        competencyId: "c3",
        assessedStudents: 0,
        masteredStudents: 0,
        percentage: null,
        linkedItems: 0,
      },
    ]);
  });
});
