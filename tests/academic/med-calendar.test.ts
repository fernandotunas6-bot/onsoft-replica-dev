import { describe, expect, it } from "vitest";
import {
  currentSchoolStartYear,
  easterSunday,
  medCalendar,
  medCalendarByRule,
  medTermsForYear,
} from "@/features/academic/med-calendar";
import { termDrafts } from "@/features/academic/calendar-terms";

describe("calendário escolar nacional (MED)", () => {
  it("a regra reproduz dia a dia o Decreto Executivo n.º 686/25 (2025/2026)", () => {
    const decreto = medCalendar(2025);
    const regra = medCalendarByRule(2025);
    expect(decreto.source.kind).toBe("decreto");
    expect(regra.startsOn).toBe(decreto.startsOn);
    expect(regra.endsOn).toBe(decreto.endsOn);
    expect(regra.terms).toEqual(decreto.terms);
  });

  it("2026/2027: Setembro a Julho, pausas de Natal e da Páscoa (27/3/2027)", () => {
    const cal = medCalendar(2026);
    expect(cal.name).toBe("2026/2027");
    expect(cal.startsOn).toBe("2026-09-02");
    expect(cal.endsOn).toBe("2027-07-31");
    expect(cal.terms.map((t) => [t.startsOn, t.endsOn])).toEqual([
      ["2026-09-02", "2026-12-18"],
      ["2027-01-04", "2027-03-19"],
      ["2027-04-05", "2027-07-08"],
    ]);
    expect(cal.source.kind).toBe("padrao");
  });

  it("os trimestres nunca se sobrepõem e caem em dias úteis", () => {
    for (let year = 2024; year <= 2035; year += 1) {
      const terms = medCalendar(year).terms;
      for (let i = 0; i < terms.length; i += 1) {
        const t = terms[i]!;
        expect(t.startsOn < t.endsOn, `${year} T${t.sequence}`).toBe(true);
        for (const d of [t.startsOn, t.endsOn]) {
          const day = new Date(`${d}T00:00:00Z`).getUTCDay();
          expect(day === 0 || day === 6, `${year} ${d}`).toBe(false);
        }
        if (i > 0) expect(terms[i - 1]!.endsOn < t.startsOn).toBe(true);
      }
    }
  });

  it("Páscoa correcta", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2030)).toBe("2030-04-21");
  });

  it("ano em curso: de Agosto em diante prepara-se o ano que abre em Setembro", () => {
    expect(currentSchoolStartYear("2026-09-30")).toBe(2026);
    expect(currentSchoolStartYear("2026-08-10")).toBe(2026);
    expect(currentSchoolStartYear("2027-03-01")).toBe(2026);
  });

  it("um ano com datas próprias (ex.: ensino superior em Outubro) não recebe trimestres do MED", () => {
    expect(medTermsForYear({ startsOn: "2026-10-05", endsOn: "2027-07-30" })).toBeNull();
    expect(medTermsForYear({ startsOn: "2026-02-01", endsOn: "2026-12-15" })).toBeNull();
  });

  it("o formulário de trimestres propõe as datas do MED e ajusta-as às do ano gravado", () => {
    const drafts = termDrafts({ startsOn: "2026-09-07", endsOn: "2027-07-15" }, []);
    expect(drafts[0]).toMatchObject({ startsOn: "2026-09-07", endsOn: "2026-12-18" });
    expect(drafts[1]).toMatchObject({ startsOn: "2027-01-04", endsOn: "2027-03-19" });
    expect(drafts[2]).toMatchObject({ startsOn: "2027-04-05", endsOn: "2027-07-08" });
  });
});
