import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest } from "../helpers/fake-postgrest";

/**
 * Faltas do portal do aluno. A chamada por disciplina, a do QR da escola e a da
 * presença do professor gravam as sessões sem `academic_year_id` (só a turma): com
 * o filtro pelo ano na leitura, essas faltas desapareciam do portal.
 */
const visible = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: async () => visible.value,
}));

const { getMyAbsencesBySubject } = await import("@/features/dashboard/student-absences");

const SCHOOL = "school";
const STUDENT = "student-1";

function school(sessions: Array<Record<string, unknown>>) {
  return {
    enrollments: [
      {
        id: "enr-1",
        school_id: SCHOOL,
        student_id: STUDENT,
        class_group_id: "turma-2026",
        status: "active",
        created_at: "2026-09-01",
      },
    ],
    class_groups: [
      { id: "turma-2026", school_id: SCHOOL, academic_year_id: "ano-2026" },
      { id: "turma-2025", school_id: SCHOOL, academic_year_id: "ano-2025" },
    ],
    assessment_rule_sets: [],
    subjects: [{ id: "mat", school_id: SCHOOL, name: "Matemática" }],
    siga_attendance_sessions: sessions,
    siga_attendance_records: sessions.map((session, n) => ({
      id: `r-${n}`,
      school_id: SCHOOL,
      student_id: STUDENT,
      session_id: session.id,
      status: "absent",
    })),
  };
}

const session = (id: string, extra: Record<string, unknown>) => ({
  id,
  school_id: SCHOOL,
  subject_id: "mat",
  status: "completed",
  ...extra,
});

beforeEach(() => {
  visible.value = null;
});

describe("faltas do portal e o ano lectivo das aulas", () => {
  it("conta as aulas sem ano da turma deste ano e ignora as de outro ano", async () => {
    const db = fakePostgrest(
      school([
        session("com-ano", { academic_year_id: "ano-2026", class_group_id: "turma-2026" }),
        session("sem-ano", { academic_year_id: null, class_group_id: "turma-2026" }),
        session("ano-anterior", { academic_year_id: "ano-2025", class_group_id: "turma-2025" }),
        session("sem-ano-anterior", { academic_year_id: null, class_group_id: "turma-2025" }),
      ]),
    ).client;
    visible.value = { db, schoolId: SCHOOL, studentId: STUDENT };
    const result = await getMyAbsencesBySubject("user-1", {});
    expect(result.totals.lessons).toBe(2);
    expect(result.totals.absences).toBe(2);
  });
});
