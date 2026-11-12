import { describe, expect, it } from "vitest";
import { enrollmentContextFromClass } from "@/features/students/enrollment-directory";
const group = {
  id: "class-a",
  name: "A",
  grade_name: "7.ª",
  course_name: "Geral",
  academic_year_id: "year-a",
  course_id: "course-a",
  shift: "morning",
  room_name: "03",
  status: "active",
};
describe("Matrícula a partir da turma", () => {
  it("preserva o contexto académico completo", () => {
    expect(enrollmentContextFromClass([group], group.id)).toEqual({
      academicYearId: "year-a",
      courseId: "course-a",
      gradeName: "7.ª",
      shift: "morning",
      roomName: "03",
      turmaId: "class-a",
    });
  });
  it("não aceita uma turma fora do workspace autorizado", () => {
    expect(enrollmentContextFromClass([group], "other-school-class")).toBeNull();
  });
  it.each(["inactive", "archived", "closed"])("não preenche uma turma %s", (status) => {
    expect(enrollmentContextFromClass([{ ...group, status }], group.id)).toBeNull();
  });
  it("tolera ligações sem turma e dados ainda a carregar", () => {
    expect(enrollmentContextFromClass([group], undefined)).toBeNull();
    expect(enrollmentContextFromClass([], group.id)).toBeNull();
  });
});
