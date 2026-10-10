import { expect, it } from "vitest";
import { upcomingSlots } from "../src/domain/upcoming";
import type { AcademicCatalog } from "../src/domain/catalog";
const catalog: AcademicCatalog = {
  schoolId: "school",
  role: "aluno",
  classes: [
    {
      classSubjectId: "cs",
      classGroupId: "g",
      academicYearId: "y",
      className: "Turma",
      subjectId: "s",
      subjectName: "Disciplina",
      teacher: null,
      students: [],
    },
  ],
  tasks: [],
  timetable: [
    {
      slotId: "slot",
      classSubjectId: "cs",
      scheduleId: "schedule",
      publication: "published",
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      weekday: 6,
      startsAt: "09:00:00",
      endsAt: "10:00:00",
      room: null,
    },
  ],
};
it("uses Luanda clock, published validity and future start times", () => {
  expect(upcomingSlots(catalog, new Date("2026-10-10T07:59:00Z"))[0].date).toBe("2026-10-10");
  expect(upcomingSlots(catalog, new Date("2026-10-10T08:00:00Z"))[0].date).toBe("2026-10-17");
  expect(upcomingSlots(catalog, new Date("2026-10-31T09:00:00Z"))).toHaveLength(0);
});
it("excludes unassigned, legacy and not-yet-valid schedules", () => {
  const slot = catalog.timetable[0];
  const c = {
    ...catalog,
    timetable: [
      { ...slot, publication: "legacy" as const, scheduleId: null },
      { ...slot, classSubjectId: "foreign" },
      { ...slot, validFrom: "2026-11-01" },
    ],
  };
  expect(upcomingSlots(c, new Date("2026-10-10T07:00:00Z"))).toHaveLength(0);
});
it("crosses UTC midnight according to Luanda and bounds the recurrence horizon", () => {
  const c = {
    ...catalog,
    timetable: [{ ...catalog.timetable[0], weekday: 7, startsAt: "00:30:00", endsAt: "01:00:00" }],
  };
  const rows = upcomingSlots(c, new Date("2026-10-10T23:00:00Z"));
  expect(rows[0].date).toBe("2026-10-11");
  expect(rows).toHaveLength(2);
});
