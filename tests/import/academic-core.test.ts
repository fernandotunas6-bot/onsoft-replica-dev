import { describe, expect, it } from "vitest";
import {
  normalizeShift,
  parseScore,
  parseTerm,
  resolveClassGroup,
  resolveGradeLevel,
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
    expect(resolveSubject("Físic", subjects).row).toBeNull();
  });

  it("sem correspondência exacta, usa a equivalência do catálogo (só por nome)", () => {
    const school = [
      { id: "lp", code: "LP", name: "Língua Portuguesa" },
      { id: "ing", code: "LE", name: "Língua Estrangeira (Inglês)" },
      { id: "em", code: "EM", name: "Educação Moral" },
    ];
    expect(resolveSubject("L. Portuguesa", school)).toEqual({
      row: school[0],
      ambiguous: false,
      viaCatalog: true,
    });
    expect(resolveSubject("Inglês", school).row?.id).toBe("ing");
    // O exacto ganha e não leva aviso.
    expect(resolveSubject("EM", school)).toEqual({ row: school[2], ambiguous: false });
    // Sigla solta não passa pelo catálogo: «EMC» não vira nenhuma disciplina.
    expect(resolveSubject("EMC", school).row).toBeNull();
    // Duas disciplinas da escola que o catálogo considera a mesma: ambíguo, nada escolhido.
    const twice = [
      ...school,
      { id: "ing2", code: "ING", name: "Inglês Geral" },
      { id: "ing3", code: "ENG", name: "English" },
    ];
    expect(resolveSubject("Língua Inglesa", twice)).toEqual({ row: null, ambiguous: true });
  });

  it("normaliza os três períodos angolanos sem inventar um quarto período", () => {
    expect(parseTerm("1º Trimestre")).toBe(1);
    expect(parseTerm("Segundo Trimestre")).toBe(2);
    expect(parseTerm("3° trimestre")).toBe(3);
    expect(parseTerm("4º Trimestre")).toBeNull();
    expect(parseTerm("Período desconhecido")).toBeNull();
  });

  it("aceita os períodos escritos de outra forma, pelas regras do catálogo", () => {
    expect(parseTerm("I Trimestre")).toBe(1);
    expect(parseTerm("III trimestre")).toBe(3);
    expect(parseTerm("T2")).toBe(2);
    expect(parseTerm("IV Trimestre")).toBeNull();
    expect(parseTerm("Exame")).toBeNull();
  });

  it("encontra a classe escrita de outra forma, só quando é uma", () => {
    const grades = [
      { id: "g10", code: "10", name: "10ª Classe" },
      { id: "g11", code: "11", name: "11ª Classe" },
      { id: "a7", code: "7A", name: "7º Ano" },
    ];
    for (const raw of ["10ª Classe", "10.ª Classe", "10"]) {
      expect(resolveGradeLevel(raw, grades), raw).toEqual({ row: grades[0], ambiguous: false });
    }
    for (const raw of ["10a classe", "décima classe", "Décima Classe"]) {
      expect(resolveGradeLevel(raw, grades), raw).toEqual({
        row: grades[0],
        ambiguous: false,
        viaCatalog: true,
      });
    }
    expect(resolveGradeLevel("7.º ano", grades).row?.id).toBe("a7");
    // A unidade conta: «7ª classe» não é o «7º Ano».
    expect(resolveGradeLevel("7ª classe", grades).row).toBeNull();
    expect(resolveGradeLevel("Turma B", grades)).toEqual({ row: null, ambiguous: false });
    const twoCourses = [
      { id: "c1", code: "10-CFB", name: "10ª Classe — Ciências" },
      { id: "c2", code: "10-CEJ", name: "10ª Classe — Humanidades" },
    ];
    expect(resolveGradeLevel("10a classe", twoCourses)).toEqual({ row: null, ambiguous: true });
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
