import { describe, expect, it } from "vitest";
import {
  normalizeShift,
  parseScore,
  parseTerm,
  resolveClassGroup,
  resolveStudent,
  resolveSubject,
  uniqueExactMatch,
  type ClassGroupRef,
  type StudentRef,
  type SubjectRef,
} from "@/features/import/importers/academic-core";

describe("Import académico — resolução estrita de referências", () => {
  const students: StudentRef[] = [
    {
      id: "student-1",
      person_id: "person-1",
      student_number: "PROC-2026-042",
      national_id: "005432190LA048",
      status: "active",
    },
    {
      id: "student-2",
      person_id: "person-2",
      student_number: "PROC-2026-043",
      national_id: "005432190LA049",
      status: "active",
    },
  ];

  const groups: ClassGroupRef[] = [
    {
      id: "class-1",
      code: "10A",
      name: "10ª Classe A - Manhã",
      academic_year_id: "year-2026",
    },
  ];

  const subjects: SubjectRef[] = [
    { id: "subject-math", code: "MAT", name: "Matemática" },
    { id: "subject-physics", code: "FIS", name: "Física" },
  ];

  it("resolve aluno apenas por processo ou BI exacto normalizado", () => {
    expect(resolveStudent("PROC-2026-042", students)).toEqual({
      row: students[0],
      ambiguous: false,
    });
    expect(resolveStudent("005432190LA048", students)).toEqual({
      row: students[0],
      ambiguous: false,
    });
    expect(resolveStudent("PROC-2026", students)).toEqual({ row: null, ambiguous: false });
  });

  it("marca correspondência como ambígua em vez de escolher o primeiro registo", () => {
    const result = uniqueExactMatch(
      "10A",
      [
        { id: "a", code: "10A" },
        { id: "b", code: "10A" },
      ],
      [(row) => row.code],
    );
    expect(result.row).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  it("resolve turma e disciplina por código ou nome sem correspondência parcial", () => {
    expect(resolveClassGroup("10A", groups).row?.id).toBe("class-1");
    expect(resolveClassGroup("10ª Classe A - Manhã", groups).row?.id).toBe("class-1");
    expect(resolveClassGroup("10", groups).row).toBeNull();

    expect(resolveSubject("MAT", subjects).row?.id).toBe("subject-math");
    expect(resolveSubject("Física", subjects).row?.id).toBe("subject-physics");
    expect(resolveSubject("Fis", subjects).row).toBeNull();
  });

  it("normaliza os três períodos angolanos sem inventar um quarto período", () => {
    expect(parseTerm("1º Trimestre")).toBe(1);
    expect(parseTerm("Segundo Trimestre")).toBe(2);
    expect(parseTerm("3° trimestre")).toBe(3);
    expect(parseTerm("4º Trimestre")).toBeNull();
    expect(parseTerm("Período desconhecido")).toBeNull();
  });

  it("aceita notas 0–20, vírgula decimal e rejeita valores fora da escala", () => {
    expect(parseScore(0)).toBe(0);
    expect(parseScore("14,5")).toBe(14.5);
    expect(parseScore(20)).toBe(20);
    expect(parseScore(-1)).toBeNull();
    expect(parseScore(21)).toBeNull();
    expect(parseScore("sem nota")).toBeNull();
  });

  it("normaliza turnos sem adivinhar valores desconhecidos", () => {
    expect(normalizeShift("Manhã")).toBe("morning");
    expect(normalizeShift("vespertino")).toBe("afternoon");
    expect(normalizeShift("Noite")).toBe("evening");
    expect(normalizeShift("integral")).toBeNull();
  });
});
