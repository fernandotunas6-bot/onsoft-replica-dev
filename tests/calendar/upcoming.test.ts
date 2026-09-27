import { describe, expect, it } from "vitest";
import { buildUpcomingCalendarItems, upcomingItemHint } from "@/features/calendar/upcoming";

describe("buildUpcomingCalendarItems", () => {
  it("coloca o período em curso à frente e junta feriados nacionais", () => {
    const items = buildUpcomingCalendarItems(
      [
        {
          id: "t1",
          title: "Recuperação SIGA",
          event_date: "2026-08-20",
          ends_on: "2026-08-31",
        },
        {
          id: "t2",
          title: "1.º Trimestre",
          event_date: "2026-09-01",
          ends_on: "2026-12-20",
        },
      ],
      "2026-08-28",
      8,
    );
    expect(items[0]?.title).toBe("Recuperação SIGA");
    expect(upcomingItemHint(items[0]!, "2026-08-28")).toBe("Em curso");
    expect(items.some((item) => item.title === "Dia do Herói Nacional")).toBe(true);
    expect(items.find((item) => item.title === "1.º Trimestre")?.category).toBe("academic");
  });
});

describe("buildUpcomingCalendarItems com avaliações da turma", () => {
  it("junta as avaliações por data e ignora as passadas", () => {
    const items = buildUpcomingCalendarItems([], "2026-09-26", 20, [
      {
        id: "a1",
        title: "Química · Teste 2",
        description: null,
        event_date: "2026-10-02",
        ends_on: "2026-10-02",
        category: "assessment",
      },
      {
        id: "a0",
        title: "Antiga",
        description: null,
        event_date: "2026-09-01",
        ends_on: "2026-09-01",
        category: "assessment",
      },
    ]);
    const assessment = items.find((item) => item.category === "assessment");
    expect(assessment?.title).toBe("Química · Teste 2");
    expect(items.some((item) => item.id === "a0")).toBe(false);
    expect(upcomingItemHint(assessment!, "2026-09-26")).toBe("Avaliação");
  });
});
