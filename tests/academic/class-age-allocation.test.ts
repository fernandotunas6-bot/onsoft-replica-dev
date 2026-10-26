import { describe, expect, it } from "vitest";
import {
  planClassAllocationByAge,
  type ClassAllocationGroup,
  type ClassAllocationScope,
  type ClassAllocationStudent,
} from "@/features/academic/class-age-allocation";

const scope: ClassAllocationScope = {
  schoolId: "escola-a",
  academicYearId: "ano-2027",
  gradeLevelId: "10-classe",
  programId: "curso-geral",
  shift: "morning",
};
const student = (
  studentId: string,
  birthDate: string | null,
  extra: Partial<ClassAllocationStudent> = {},
): ClassAllocationStudent => ({
  ...scope,
  studentId,
  studentNumber: studentId,
  birthDate,
  ...extra,
});
const group = (
  id: string,
  letter: string,
  capacity: number,
  extra: Partial<ClassAllocationGroup> = {},
): ClassAllocationGroup => ({
  ...scope,
  id,
  letter,
  capacity,
  reservedSeats: 0,
  status: "draft",
  ...extra,
});
const simulate = (
  students: ClassAllocationStudent[],
  groups: ClassAllocationGroup[],
  mode: "vacancies" | "reorganize" = "reorganize",
) => planClassAllocationByAge({ scope, referenceDate: "2027-02-01", students, groups, mode });

describe("turmas A-Z com os mais novos primeiro", () => {
  it("a turma A recebe os nascidos mais recentemente, independentemente da ordem de entrada", () => {
    const plan = simulate(
      [
        student("velho", "2010-01-01"),
        student("novo", "2012-12-31"),
        student("intermedio", "2011-05-10"),
      ],
      [group("b", "B", 2), group("a", "A", 1)],
    );
    expect(plan.assignments.map((row) => [row.studentId, row.letter])).toEqual([
      ["novo", "A"],
      ["intermedio", "B"],
      ["velho", "B"],
    ]);
    expect(plan.ageOrderComplete).toBe(true);
  });

  it("empates por nascimento têm desempate estável por ID de aluno", () => {
    const plan = simulate(
      [student("1260002", "2012-03-02"), student("1260001", "2012-03-02")],
      [group("a", "A", 2)],
    );
    expect(plan.assignments.map((row) => row.studentNumber)).toEqual(["1260001", "1260002"]);
  });

  it("nunca mistura escolas, cursos, classes, anos lectivos ou turnos", () => {
    const plan = simulate(
      [
        student("correcto", "2012-03-02"),
        student("outra-escola", "2013-01-01", { schoolId: "escola-b" }),
        student("outro-curso", "2013-01-01", { programId: "curso-tecnico" }),
        student("outro-ano", "2013-01-01", { academicYearId: "ano-2028" }),
        student("outro-turno", "2013-01-01", { shift: "afternoon" }),
        student("outra-classe", "2013-01-01", { gradeLevelId: "11-classe" }),
      ],
      [group("a", "A", 10), group("a-fora", "B", 10, { schoolId: "escola-b" })],
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0]?.studentId).toBe("correcto");
    expect(plan.excluded.filter((row) => row.reason === "different_scope")).toHaveLength(5);
  });

  it("bloqueia dados de nascimento ausentes, impossíveis ou futuros", () => {
    const plan = simulate(
      [
        student("sem", null),
        student("data-invalida", "2011-02-29"),
        student("futura", "2028-01-01"),
        student("valida", "2012-02-29"),
      ],
      [group("a", "A", 4)],
    );
    expect(plan.assignments.map((row) => row.studentId)).toEqual(["valida"]);
    expect(plan.excluded.filter((row) => row.reason === "invalid_birth_date")).toHaveLength(3);
    expect(plan.ageOrderComplete).toBe(false);
  });

  it("respeita reservas e reporta excedentes, sem gravar matrículas", () => {
    const plan = simulate(
      [student("novo", "2013-01-01"), student("antigo", "2011-01-01")],
      [group("a", "A", 2, { reservedSeats: 1 })],
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0]?.studentId).toBe("novo");
    expect(plan.excluded).toContainEqual({ studentId: "antigo", reason: "no_capacity" });
  });

  it("não altera colocações protegidas e avisa que a regra global exige revisão", () => {
    const plan = simulate(
      [
        student("protegido", "2013-01-01", {
          protectedPlacement: true,
          currentClassGroupId: "b",
        }),
        student("livre", "2012-01-01"),
      ],
      [group("a", "A", 2)],
    );
    expect(plan.assignments.map((row) => row.studentId)).toEqual(["livre"]);
    expect(plan.excluded).toContainEqual({
      studentId: "protegido",
      reason: "protected_placement",
    });
    expect(plan.ageOrderComplete).toBe(false);
  });

  it("no modo vagas não muda matrículas existentes nem promete ordem integral por idade", () => {
    const plan = simulate(
      [
        student("matriculado", "2013-01-01", { currentClassGroupId: "b" }),
        student("novo", "2012-01-01"),
      ],
      [group("a", "A", 1), group("b", "B", 2, { reservedSeats: 1 })],
      "vacancies",
    );
    expect(plan.assignments.map((row) => row.studentId)).toEqual(["novo"]);
    expect(plan.excluded).toContainEqual({
      studentId: "matriculado",
      reason: "already_assigned",
    });
    expect(plan.ageOrderComplete).toBe(false);
  });

  it("recusa letras ou ocupação inválidas antes de gerar qualquer decisão", () => {
    const plan = simulate([student("u", "2011-01-01")], [group("a", "A", 1), group("b", "a", 2)]);
    expect(plan.assignments).toEqual([]);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
