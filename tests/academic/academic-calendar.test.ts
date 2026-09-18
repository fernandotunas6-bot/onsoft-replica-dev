import { describe, expect, it } from "vitest";
import { saveAcademicCalendarInputSchema } from "@/features/academic/academic-calendar";

const validCalendar = {
  yearName: "2027/2028",
  startsOn: "2027-09-01",
  endsOn: "2028-07-31",
  terms: [
    { sequence: 1, name: "1º Trimestre", startsOn: "2027-09-01", endsOn: "2027-12-15" },
    { sequence: 2, name: "2º Trimestre", startsOn: "2028-01-05", endsOn: "2028-03-31" },
    { sequence: 3, name: "3º Trimestre", startsOn: "2028-04-01", endsOn: "2028-07-15" },
  ],
};

describe("academic calendar", () => {
  it("aceita ano lectivo e três trimestres explícitos coerentes", () => {
    expect(saveAcademicCalendarInputSchema.safeParse(validCalendar).success).toBe(true);
  });

  it("rejeita sequências duplicadas ou trimestre em falta", () => {
    const result = saveAcademicCalendarInputSchema.safeParse({
      ...validCalendar,
      terms: [
        validCalendar.terms[0],
        validCalendar.terms[1],
        { ...validCalendar.terms[2], sequence: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sobreposição entre trimestres", () => {
    const result = saveAcademicCalendarInputSchema.safeParse({
      ...validCalendar,
      terms: [
        validCalendar.terms[0],
        { ...validCalendar.terms[1], startsOn: "2027-12-15" },
        validCalendar.terms[2],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita trimestre fora do ano lectivo", () => {
    const result = saveAcademicCalendarInputSchema.safeParse({
      ...validCalendar,
      terms: [
        { ...validCalendar.terms[0], startsOn: "2027-08-20" },
        validCalendar.terms[1],
        validCalendar.terms[2],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ano lectivo com data final anterior à inicial", () => {
    const result = saveAcademicCalendarInputSchema.safeParse({
      ...validCalendar,
      startsOn: "2028-08-01",
      endsOn: "2028-07-31",
    });
    expect(result.success).toBe(false);
  });
});
