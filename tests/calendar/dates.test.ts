import { describe, expect, it } from "vitest";
import { angolaHolidaysForYear, easterSundayIso } from "@/features/calendar/angola-holidays";
import {
  addDaysIso,
  isoInInclusiveRange,
  termLifecycle,
  todayInLuanda,
} from "@/features/calendar/dates";
import {
  calendarIcsFeedUrl,
  calendarWebcalFeedUrl,
  icsExclusiveEnd,
  toIcsCalendar,
} from "@/features/calendar/ics";

describe("datas do calendário (Luanda)", () => {
  it("formata hoje como YYYY-MM-DD no fuso de Luanda", () => {
    expect(todayInLuanda(new Date("2026-08-28T10:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("classifica o ciclo de vida do período", () => {
    expect(termLifecycle("2026-09-01", "2026-12-20", "2026-08-28")).toBe("futuro");
    expect(termLifecycle("2026-08-20", "2026-08-31", "2026-08-28")).toBe("em_curso");
    expect(termLifecycle("2026-04-11", "2026-07-31", "2026-08-28")).toBe("concluido");
  });

  it("inclui o último dia do intervalo", () => {
    expect(isoInInclusiveRange("2026-08-31", "2026-08-20", "2026-08-31")).toBe(true);
    expect(isoInInclusiveRange("2026-09-01", "2026-08-20", "2026-08-31")).toBe(false);
  });
});

describe("feriados nacionais de Angola", () => {
  it("calcula a Páscoa de 2026 e o Carnaval", () => {
    expect(easterSundayIso(2026)).toBe("2026-04-05");
    const holidays = angolaHolidaysForYear(2026);
    expect(holidays.find((item) => item.name === "Sexta-feira Santa")?.date).toBe("2026-04-03");
    expect(holidays.find((item) => item.name === "Carnaval")?.date).toBe("2026-02-17");
    expect(holidays.find((item) => item.name === "Dia da Independência Nacional")?.date).toBe(
      "2026-11-11",
    );
  });
});

describe("ICS", () => {
  it("usa DTEND exclusivo e o URL do feed bruto", () => {
    expect(icsExclusiveEnd("2026-12-20")).toBe("2026-12-21");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(calendarIcsFeedUrl("http://localhost:3006", "abc123tokenvalue")).toBe(
      "http://localhost:3006/api/calendar/ics?token=abc123tokenvalue",
    );
    expect(calendarWebcalFeedUrl("http://localhost:3006", "abc123tokenvalue")).toBe(
      "webcal://localhost:3006/api/calendar/ics?token=abc123tokenvalue",
    );
    const ics = toIcsCalendar(
      [
        {
          uid: "term-1@siga.plus",
          title: "1.º Trimestre",
          description: "Período lectivo 1",
          event_date: "2026-09-01",
          ends_on: "2026-12-20",
        },
      ],
      { calendarName: "Colégio Adventista · Calendário lectivo" },
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    expect(ics).toContain("DTEND;VALUE=DATE:20261221");
    expect(ics).toContain("SUMMARY:1.º Trimestre");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Colégio Adventista · Calendário lectivo");
  });
});
