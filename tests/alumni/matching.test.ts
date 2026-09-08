import { describe, expect, it } from "vitest";
import { rankMentors, scoreMentorMatch } from "@/features/alumni/matching";

const mentee = {
  id: "mentee",
  graduationYear: 2026,
  industry: "Tecnologia",
  province: "Huambo",
  city: "Huambo",
  skills: ["TypeScript"],
  interests: ["Produto", "Liderança"],
  seekingMentor: true,
};

describe("alumni mentor matching", () => {
  it("rejects self matching and unavailable mentors", () => {
    expect(scoreMentorMatch(mentee, { ...mentee, availableForMentoring: true }).score).toBe(0);
    expect(scoreMentorMatch(mentee, { id: "m2", availableForMentoring: false }).score).toBe(0);
  });

  it("scores transparent matching reasons", () => {
    const result = scoreMentorMatch(mentee, {
      id: "mentor-1",
      graduationYear: 2018,
      industry: "Tecnologia",
      province: "Huambo",
      city: "Huambo",
      skills: ["TypeScript", "Produto", "Liderança"],
      availableForMentoring: true,
    });
    expect(result.score).toBeGreaterThan(60);
    expect(result.reasons).toContain("Mesmo sector profissional");
    expect(result.reasons).toContain("Mesma província");
  });

  it("ranks the strongest mentor first", () => {
    const ranked = rankMentors(mentee, [
      { id: "weak", availableForMentoring: true, province: "Luanda", skills: ["Contabilidade"] },
      { id: "strong", availableForMentoring: true, graduationYear: 2018, industry: "Tecnologia", province: "Huambo", city: "Huambo", skills: ["TypeScript", "Produto", "Liderança"] },
    ]);
    expect(ranked[0]?.mentor.id).toBe("strong");
  });
});
