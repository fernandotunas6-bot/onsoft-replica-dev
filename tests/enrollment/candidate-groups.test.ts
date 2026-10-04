import { describe, expect, it } from "vitest";
import { orderGroupsForCandidate } from "@/features/enrollment/candidate-groups";

const grades = [
  { id: "g-dir-1", program_id: "dir", sequence: 1 },
  { id: "g-dir-2", program_id: "dir", sequence: 2 },
  { id: "g-inf-1", program_id: "inf", sequence: 1 },
];
const groups = [
  { id: "inf-a", name: "INF-1A", grade_level_id: "g-inf-1" },
  { id: "dir-2a", name: "DIR-2A", grade_level_id: "g-dir-2" },
  { id: "dir-1a", name: "DIR-1A", grade_level_id: "g-dir-1" },
];

describe("turmas para o candidato", () => {
  it("as do curso pretendido primeiro, do 1.º ano para cima", () => {
    const result = orderGroupsForCandidate(groups, grades, "dir");
    expect(result.ordered.map((g) => g.id)).toEqual(["dir-1a", "dir-2a", "inf-a"]);
    expect(result.preferredCount).toBe(2);
  });

  it("sem curso pretendido fica como estava", () => {
    expect(orderGroupsForCandidate(groups, grades, null).ordered).toBe(groups);
  });
});
