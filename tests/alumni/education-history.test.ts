import { describe, expect, it } from "vitest";
import { alumniEducationStageSchema } from "@/features/alumni/education-history";

describe("alumni education history schema", () => {
  it("accepts different institutions in the same education level", () => {
    const first = alumniEducationStageSchema.parse({
      educationLevel: "middle",
      institutionName: "Escola A",
      startedYear: 2018,
      endedYear: 2020,
    });
    const second = alumniEducationStageSchema.parse({
      educationLevel: "middle",
      institutionName: "Escola B",
      startedYear: 2020,
      endedYear: 2021,
    });
    expect(first.educationLevel).toBe("middle");
    expect(second.educationLevel).toBe("middle");
    expect(first.institutionName).not.toBe(second.institutionName);
  });

  it("rejects an end year before the start year", () => {
    const result = alumniEducationStageSchema.safeParse({
      educationLevel: "higher",
      institutionName: "Universidade",
      startedYear: 2025,
      endedYear: 2024,
    });
    expect(result.success).toBe(false);
  });
});
