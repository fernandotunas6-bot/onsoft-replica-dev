import { describe, expect, it } from "vitest";
import { suggestTerms, termDrafts } from "@/features/academic/calendar-terms";
import { saveAcademicCalendarInputSchema } from "@/features/academic/academic-calendar";

describe("trimestres sugeridos", () => {
  const terms = suggestTerms("2026-09-01", "2027-07-31");

  it("cobrem o ano inteiro, seguidos e sem sobreposição", () => {
    expect(terms.map((t) => t.sequence)).toEqual([1, 2, 3]);
    expect(terms[0]!.startsOn).toBe("2026-09-01");
    expect(terms[2]!.endsOn).toBe("2027-07-31");
    for (let i = 1; i < terms.length; i++) {
      expect(terms[i]!.startsOn > terms[i - 1]!.endsOn).toBe(true);
    }
  });

  it("passam a validação do servidor", () => {
    const parsed = saveAcademicCalendarInputSchema.safeParse({
      yearName: "2026/2027",
      startsOn: "2026-09-01",
      endsOn: "2027-07-31",
      terms,
    });
    expect(parsed.success).toBe(true);
  });

  it("mantêm os trimestres já gravados e sugerem só os que faltam", () => {
    const drafts = termDrafts({ startsOn: "2026-09-01", endsOn: "2027-07-31" }, [
      { sequence: 2, name: "II Trimestre", startsOn: "2027-01-06", endsOn: "2027-04-02" },
    ]);
    expect(drafts[1]).toEqual({
      sequence: 2,
      name: "II Trimestre",
      startsOn: "2027-01-06",
      endsOn: "2027-04-02",
    });
    expect(drafts[0]!.name).toBe("1º Trimestre");
    expect(drafts[2]!.name).toBe("3º Trimestre");
  });
});
