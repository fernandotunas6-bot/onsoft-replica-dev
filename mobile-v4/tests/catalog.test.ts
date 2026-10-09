import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAcademicCatalog } from "../src/domain/catalog-validation";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context } from "../src/domain/model";
import { ApiGateway } from "../src/services/api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const student: Context = { schoolId: id(1), userId: id(3), role: "aluno" };
const teacher: Context = { schoolId: id(1), userId: id(4), role: "professor" };
function fixture(ctx = student): AcademicCatalog {
  return {
    schoolId: ctx.schoolId,
    role: ctx.role,
    classes: [
      {
        classSubjectId: id(42),
        classGroupId: id(12),
        academicYearId: id(10),
        className: "Turma do fixture",
        subjectId: id(40),
        subjectName: "Matemática",
        teacher: { id: id(22), name: "Docente do fixture", userId: teacher.userId },
        students: [
          {
            studentId: id(20),
            enrollmentId: id(50),
            name: "Aluno do fixture",
            userId: student.userId,
          },
        ],
      },
    ],
    timetable: [
      {
        slotId: id(63),
        classSubjectId: id(42),
        scheduleId: id(60),
        publication: "published",
        validFrom: "2026-10-01",
        validTo: null,
        weekday: 1,
        startsAt: "08:00:00",
        endsAt: "09:00:00",
        room: "Sala do fixture",
      },
    ],
    tasks: [
      {
        id: id(70),
        classSubjectId: id(42),
        slotId: id(63),
        kind: "trabalho",
        title: "Trabalho do fixture",
        instructions: null,
        due: null,
      },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("canonical academic response contract", () => {
  it("preserves canonical identifiers and null institutional fields", () => {
    const data = fixture();
    expect(parseAcademicCatalog(data, student)).toEqual(data);
    expect(parseAcademicCatalog(fixture(teacher), teacher).classes[0].teacher?.userId).toBe(
      teacher.userId,
    );
  });
  it("preserves an explicitly unversioned legacy slot and ISO Sunday", () => {
    const data = fixture();
    Object.assign(data.timetable[0], {
      publication: "legacy",
      scheduleId: null,
      validFrom: null,
      validTo: null,
      weekday: 7,
    });
    expect(parseAcademicCatalog(data, student).timetable[0].publication).toBe("legacy");
  });
  it("accepts a published schedule with no configured validity start", () => {
    const data = fixture();
    data.timetable[0].validFrom = null;
    expect(parseAcademicCatalog(data, student).timetable[0].validFrom).toBeNull();
  });
  it.each([
    [
      "another school",
      (d: AcademicCatalog) => {
        d.schoolId = id(2);
      },
    ],
    [
      "another role",
      (d: AcademicCatalog) => {
        d.role = "professor";
      },
    ],
    [
      "classmate data",
      (d: AcademicCatalog) => {
        d.classes[0].students.push({
          studentId: id(21),
          enrollmentId: id(51),
          name: "Peer",
          userId: id(5),
        });
      },
    ],
    [
      "unscoped class",
      (d: AcademicCatalog) => {
        d.classes[0].students = [];
      },
    ],
    [
      "noncanonical ID",
      (d: AcademicCatalog) => {
        d.classes[0].classSubjectId = "demo-class";
      },
    ],
    [
      "duplicate discipline",
      (d: AcademicCatalog) => {
        d.classes.push(structuredClone(d.classes[0]));
      },
    ],
    [
      "foreign slot",
      (d: AcademicCatalog) => {
        d.timetable[0].classSubjectId = id(43);
      },
    ],
    [
      "unknown task slot",
      (d: AcademicCatalog) => {
        d.tasks[0].slotId = id(64);
      },
    ],
    [
      "invalid weekday",
      (d: AcademicCatalog) => {
        d.timetable[0].weekday = 0;
      },
    ],
    [
      "invalid time",
      (d: AcademicCatalog) => {
        d.timetable[0].startsAt = "24:99";
      },
    ],
    [
      "zero duration in mixed time encodings",
      (d: AcademicCatalog) => {
        d.timetable[0].startsAt = "08:00";
        d.timetable[0].endsAt = "08:00:00";
      },
    ],
    [
      "false legacy publication",
      (d: AcademicCatalog) => {
        d.timetable[0].publication = "legacy";
      },
    ],
    [
      "invalid calendar date",
      (d: AcademicCatalog) => {
        d.tasks[0].due = "2026-02-30";
      },
    ],
    [
      "unrequested personal fields",
      (d: AcademicCatalog) => {
        Object.assign(d.classes[0].students[0], { email: "private@example.invalid" });
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const data = fixture();
    (mutate as (data: AcademicCatalog) => void)(data);
    expect(() => parseAcademicCatalog(data, student)).toThrow("Contrato académico");
  });
  it("refuses another teacher's class under professor role", () => {
    const data = fixture(teacher);
    data.classes[0].teacher!.userId = id(6);
    expect(() => parseAcademicCatalog(data, teacher)).toThrow();
  });
});

describe("academic catalog transport", () => {
  it("uses the fresh session token, exact route school/role and AbortSignal", async () => {
    const accessToken = vi
      .fn()
      .mockResolvedValueOnce("session-token")
      .mockResolvedValueOnce("catalog-token");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userId: student.userId,
          name: "Test",
          memberships: [
            {
              schoolId: student.schoolId,
              schoolName: "Test school",
              active: true,
              roles: ["aluno"],
              permissions: ["academic.read"],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture() });
    vi.stubGlobal("fetch", fetch);
    const api = new ApiGateway("/api/mobile-v4", { accessToken });
    await api.session();
    const signal = new AbortController().signal;
    expect(await api.academicCatalog(student, signal)).toEqual(fixture());
    expect(fetch.mock.calls[1][0]).toBe(
      `/api/mobile-v4/schools/${student.schoolId}/academic?role=aluno`,
    );
    expect(fetch.mock.calls[1][1]).toMatchObject({
      signal,
      cache: "no-store",
      headers: { Authorization: "Bearer catalog-token" },
    });
  });
  it("does not contact the catalog API without an authorized session", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(new ApiGateway().academicCatalog(student)).rejects.toThrow("Sem permissão");
    expect(fetch).not.toHaveBeenCalled();
  });
});
