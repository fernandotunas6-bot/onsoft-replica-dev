import { describe, expect, it } from "vitest";
import { horariosImporter } from "@/features/import/importers/horarios-importer";

function cache(overrides: Record<string, unknown> = {}) {
  return {
    existingPeople: [],
    classGroups: [{ id: "class-1", code: "10A", name: "10ª A" }],
    subjects: [{ id: "subject-1", code: "MAT", name: "Matemática" }],
    teachers: [{ id: "teacher-1", employee_number: "T-001", national_id: "BI-1" }],
    classSubjects: [],
    existingSlots: new Set<string>(),
    scheduledSlots: [],
    studentByPersonId: new Map(),
    ...overrides,
  };
}

const row = {
  class_group: "10A",
  subject: "MAT",
  teacher_identifier: "T-001",
  weekday: "segunda",
  start_time: "08:00",
  end_time: "09:00",
  room: "Sala 1",
};

describe("horariosImporter", () => {
  it("rejeita período cujo fim não é posterior ao início", () => {
    const result = horariosImporter.analyzeRow({ ...row, end_time: "08:00" }, cache() as any);

    expect(result.status).toBe("error");
    expect(result.errors).toContain("A hora de fim deve ser posterior à hora de início.");
  });

  it("rejeita conflito de turma por sobreposição de intervalo", () => {
    const result = horariosImporter.analyzeRow(
      row,
      cache({
        scheduledSlots: [
          {
            classGroupId: "class-1",
            teacherId: "teacher-2",
            weekday: 1,
            startsAt: 510,
            endsAt: 570,
            room: "Sala 2",
          },
        ],
      }) as any,
    );

    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("Conflito de horário");
  });

  it("rejeita docente diferente da associação existente turma-disciplina", () => {
    const result = horariosImporter.analyzeRow(
      row,
      cache({
        classSubjects: [
          {
            id: "class-subject-1",
            class_group_id: "class-1",
            subject_id: "subject-1",
            teacher_id: "teacher-2",
          },
        ],
      }) as any,
    );

    expect(result.status).toBe("error");
    expect(result.errors).toContain(
      "A disciplina já está atribuída a outro professor nesta turma.",
    );
  });
});
