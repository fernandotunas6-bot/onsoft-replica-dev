import { describe, expect, it } from "vitest";
import {
  createCalendarEventInputSchema,
  deleteCalendarEventInputSchema,
  listCalendarEventsInputSchema,
  updateCalendarEventInputSchema,
} from "@/features/calendar/schemas";

describe("createCalendarEventInputSchema", () => {
  it("requires a title and both dates", () => {
    expect(createCalendarEventInputSchema.safeParse({}).success).toBe(false);
    expect(
      createCalendarEventInputSchema.parse({
        title: "1º Trimestre",
        eventDate: "2026-09-01",
        endsOn: "2026-12-15",
      }).category,
    ).toBe("academic");
  });

  it("rejects an incomplete end date", () => {
    expect(
      createCalendarEventInputSchema.safeParse({
        title: "Recuperação",
        eventDate: "2026-08-15",
        endsOn: "2026-08",
      }).success,
    ).toBe(false);
  });
});

describe("updateCalendarEventInputSchema", () => {
  it("exige id, nome e datas completas", () => {
    expect(updateCalendarEventInputSchema.safeParse({ title: "2º Trimestre" }).success).toBe(false);
    const parsed = updateCalendarEventInputSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      title: "2º Trimestre",
      eventDate: "2027-01-12",
      endsOn: "2027-04-02",
    });
    expect(parsed.title).toBe("2º Trimestre");
  });
});

describe("listCalendarEventsInputSchema", () => {
  it("aceita ano lectivo e períodos já concluídos", () => {
    expect(
      listCalendarEventsInputSchema.parse({
        academicYearId: "11111111-1111-1111-1111-111111111111",
        includePast: true,
      }),
    ).toMatchObject({ limit: 50, includePast: true });
  });
});

describe("deleteCalendarEventInputSchema", () => {
  it("exige o id do período", () => {
    expect(deleteCalendarEventInputSchema.safeParse({}).success).toBe(false);
    expect(
      deleteCalendarEventInputSchema.parse({ id: "11111111-1111-1111-1111-111111111111" }).id,
    ).toHaveLength(36);
  });
});
