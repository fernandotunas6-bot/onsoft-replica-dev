import { describe, expect, it } from "vitest";
import {
  buildEnrollmentDirectory,
  formatEnrollmentClassGroupLabel,
  type EnrollmentClassGroup,
} from "@/features/students/enrollment-directory";

const groups: EnrollmentClassGroup[] = [
  {
    id: "a",
    name: "Turma A",
    grade_name: "10ª Classe",
    course_name: "Ciências",
    course_id: "ciencias",
    academic_year_id: "2026",
    academic_year_name: "2026/2027",
    shift: "Manhã",
    room_name: "Sala 01",
    capacity: 35,
    enrolled_count: 28,
    status: "active",
  },
  {
    id: "b",
    name: "Turma B",
    grade_name: "11ª Classe",
    course_name: "Ciências",
    course_id: "ciencias",
    academic_year_id: "2026",
    academic_year_name: "2026/2027",
    shift: "Tarde",
    room_name: "Sala 02",
    capacity: 30,
    enrolled_count: 30,
    status: "active",
  },
  {
    id: "c",
    name: "Turma C",
    grade_name: "10ª Classe",
    course_name: "Informática",
    course_id: "informatica",
    academic_year_id: "2027",
    academic_year_name: "2027/2028",
    shift: "Manhã",
    room_name: "Laboratório 1",
    status: "active",
  },
];

describe("enrollment directory", () => {
  it("filters hierarchically by academic year and course", () => {
    const directory = buildEnrollmentDirectory(groups, {
      academicYearId: "2026",
      courseId: "ciencias",
      gradeName: "10ª Classe",
    });

    expect(directory.academicYears).toHaveLength(2);
    expect(directory.courses.map((item) => item.label)).toEqual(["Ciências"]);
    expect(directory.classGroups.map((group) => group.id)).toEqual(["a"]);
  });

  it("shows room and capacity in the final class label", () => {
    expect(formatEnrollmentClassGroupLabel(groups[0]!)).toContain("Sala 01");
    expect(formatEnrollmentClassGroupLabel(groups[0]!)).toContain("28/35 alunos");
  });

  it("excludes closed class groups", () => {
    const directory = buildEnrollmentDirectory(
      [...groups, { ...groups[0]!, id: "closed", status: "closed" }],
      {},
    );
    expect(directory.classGroups.some((group) => group.id === "closed")).toBe(false);
  });
});
