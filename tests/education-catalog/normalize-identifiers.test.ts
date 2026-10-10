import { describe, expect, it } from "vitest";
import {
  formatIdentifier,
  insertWithSequentialCode,
  nextSequentialCode,
  suggestNextCode,
  isValidIdentifier,
  parseIdentifier,
  studentPublicCode,
} from "@/features/education-catalog/identifiers";
import {
  courseCatalogKey,
  findSubjectDuplicates,
  normalizeGrade,
  normalizePeriod,
  resolveSubject,
} from "@/features/education-catalog/normalize";
import { editDistance, initials, normalizeText } from "@/features/education-catalog/search";

describe("normalização de texto", () => {
  it("tira acentos, maiúsculas e pontuação", () => {
    expect(normalizeText("  Educação   Física! ")).toBe("educacao fisica");
    expect(initials("Educação Moral e Cívica")).toBe("emc");
    expect(editDistance("quimca", "quimica")).toBe(1);
    expect(editDistance("geografai", "geografia")).toBe(1);
    expect(editDistance("abc", "xyzw")).toBeGreaterThan(2);
  });
});

describe("classes", () => {
  it.each([
    ["10ª Classe", 10, "classe"],
    ["10.ª Classe", 10, "classe"],
    ["10a classe", 10, "classe"],
    ["décima classe", 10, "classe"],
    ["Décima Segunda Classe", 12, "classe"],
    ["7.º ano", 7, "ano"],
    ["1º Ano", 1, "ano"],
    ["13", 13, "classe"],
  ])("%s → %i (%s)", (raw, n, unit) => {
    expect(normalizeGrade(raw)).toMatchObject({ n, unit });
  });

  it("reconhece a iniciação e recusa o que não é classe", () => {
    expect(normalizeGrade("Iniciação")).toMatchObject({ n: 0, label: "Iniciação" });
    expect(normalizeGrade("Turma B")).toBeNull();
    expect(normalizeGrade("25ª classe")).toBeNull();
    expect(normalizeGrade("")).toBeNull();
  });
});

describe("períodos", () => {
  it.each([
    ["1º Trimestre", 1, "trimestre"],
    ["I Trimestre", 1, "trimestre"],
    ["III trimestre", 3, "trimestre"],
    ["Segundo Trimestre", 2, "trimestre"],
    ["1.º período", 1, "periodo"],
    ["2º semestre", 2, "semestre"],
    ["T1", 1, "trimestre"],
    ["S2", 2, "semestre"],
    ["2T", 2, "trimestre"],
  ])("%s → %i %s", (raw, n, kind) => {
    expect(normalizePeriod(raw)).toMatchObject({ n, kind });
  });

  it("recusa números fora do modelo", () => {
    expect(normalizePeriod("4º Trimestre")).toBeNull();
    expect(normalizePeriod("3º semestre")).toBeNull();
    expect(normalizePeriod("Exame")).toBeNull();
  });
});

describe("disciplinas", () => {
  it("Matemática, Matematica e MAT são a mesma disciplina", () => {
    for (const raw of ["Matemática", "Matematica", "MAT", "mat."]) {
      expect(resolveSubject(raw)?.subject.code, raw).toBe("MAT");
    }
    expect(resolveSubject("L. Portuguesa")?.subject.code).toBe("LP");
    expect(resolveSubject("Português")?.subject.code).toBe("LP");
    expect(resolveSubject("Língua Estrangeira (Inglês)")?.subject.code).toBe("ING");
  });

  it("aceita um erro de uma letra, mas não adivinha o resto", () => {
    expect(resolveSubject("Matemátca")).toMatchObject({ subject: { code: "MAT" }, via: "typo" });
    expect(resolveSubject("Xpto")).toBeNull();
    expect(resolveSubject("Mat")?.via).toBe("exact");
    expect(resolveSubject("Mt")).toBeNull();
  });

  it("encontra os duplicados de uma escola", () => {
    expect(
      findSubjectDuplicates(["Matemática", "Matematica", "MAT", "Física", "História", "Historia"]),
    ).toEqual([
      { code: "MAT", names: ["Matemática", "Matematica", "MAT"] },
      { code: "HIST", names: ["História", "Historia"] },
    ]);
  });
});

describe("cursos", () => {
  it("reconhece o curso pelo nome ou sinónimo, nunca pela sigla", () => {
    expect(courseCatalogKey("Ciências Económico-Jurídicas")).toBe("SEC-CEJ");
    expect(courseCatalogKey("ciencias economicas e juridicas")).toBe("SEC-CEJ");
    expect(courseCatalogKey("CEJ")).toBeNull();
    expect(courseCatalogKey("Curso de Teatro Experimental")).toBeNull();
    expect(courseCatalogKey("")).toBeNull();
  });
});

describe("identificadores curtos", () => {
  it("formata segundo a política", () => {
    // O que a base já usa para professores: «DOC-000012».
    expect(formatIdentifier("teacher", 12)).toBe("DOC-000012");
    expect(formatIdentifier("staff", 12)).toBe("F-0012");
    expect(formatIdentifier("class_group", 1)).toBe("T-001");
    expect(formatIdentifier("room", 1)).toBe("S-001");
    expect(formatIdentifier("enrollment", 123)).toBe("M-000123");
    expect(formatIdentifier("document", 123)).toBe("OT-000123");
    expect(formatIdentifier("school", 1)).toBe("ESC-001");
    // O número de processo do aluno é o que a base já gera (CHECK ^EST-[0-9]{6,}$).
    expect(formatIdentifier("student", 1)).toBe("EST-000001");
    expect(formatIdentifier("room", 7, { prefix: "LAB", padding: 2 })).toBe("LAB-07");
    // Passa do preenchimento sem cortar.
    expect(formatIdentifier("class_group", 12345)).toBe("T-12345");
  });

  it("recusa números inválidos", () => {
    expect(() => formatIdentifier("teacher", 0)).toThrow(RangeError);
    expect(() => formatIdentifier("teacher", 1.5)).toThrow(RangeError);
  });

  it("lê e valida códigos", () => {
    expect(parseIdentifier("teacher", " doc-000012 ")).toEqual({ n: 12, code: "DOC-000012" });
    expect(parseIdentifier("teacher", "DOC-12")).toBeNull();
    expect(parseIdentifier("teacher", "F-0012")).toBeNull();
    expect(parseIdentifier("teacher", "DOC-000000")).toBeNull();
    expect(isValidIdentifier("student", "EST-000123")).toBe(true);
    expect(isValidIdentifier("student", "0000123")).toBe(false);
  });

  it("o código público do aluno continua com 7 dígitos", () => {
    expect(studentPublicCode("EST-000123", "00000000-0000-0000-0000-000000000000")).toBe("0000123");
  });
});

describe("próximo número sem repetir", () => {
  it("segue o maior existente, não a contagem", () => {
    // Três professores, um apagado (DOC-000002) e um número escrito à mão: a
    // contagem dava DOC-000003, que já existe.
    expect(nextSequentialCode(["DOC-000001", "DOC-000003", "PROF-9", null], "DOC", 6)).toBe(
      "DOC-000004",
    );
    expect(nextSequentialCode([], "DOC", 6)).toBe("DOC-000001");
    expect(nextSequentialCode(["doc-000041"], "DOC", 6)).toBe("DOC-000042");
  });

  it("sugere o código seguinte no padrão que a escola já usa", () => {
    expect(suggestNextCode("room", ["S01", "S02", "S07", "LAB-CIE"])).toBe("S08");
    expect(suggestNextCode("room", ["LAB-1", "LAB-2", "S01"])).toBe("LAB-3");
    expect(suggestNextCode("room", [])).toBe("S-001");
    expect(suggestNextCode("room", ["AUDITORIO"])).toBe("S-001");
    expect(suggestNextCode("room", ["S-001"])).toBe("S-002");
  });

  it("noutra gravação com o mesmo número, tenta o seguinte", async () => {
    const stored = ["DOC-000001"];
    const tried: string[] = [];
    let raced = false;
    const result = await insertWithSequentialCode({
      prefix: "DOC",
      padding: 6,
      constraint: "teachers_school_id_employee_number_key",
      loadExisting: async () => [...stored],
      insert: async (code) => {
        tried.push(code);
        // Outro pedido grava DOC-000002 entre a leitura e a escrita.
        if (!raced) {
          raced = true;
          stored.push(code);
          return {
            data: null,
            error: {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "teachers_school_id_employee_number_key"',
            },
          };
        }
        stored.push(code);
        return { data: { id: "t1", code }, error: null };
      },
    });
    expect(tried).toEqual(["DOC-000002", "DOC-000003"]);
    expect(result.data).toEqual({ id: "t1", code: "DOC-000003" });
  });

  it("outro erro não se repete", async () => {
    let calls = 0;
    const result = await insertWithSequentialCode({
      prefix: "DOC",
      padding: 6,
      constraint: "teachers_school_id_employee_number_key",
      loadExisting: async () => [],
      insert: async () => {
        calls += 1;
        return { data: null, error: { code: "23505", message: "people_school_email_uidx" } };
      },
    });
    expect(calls).toBe(1);
    expect(result.error?.message).toBe("people_school_email_uidx");
  });
});
