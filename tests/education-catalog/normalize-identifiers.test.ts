import { describe, expect, it } from "vitest";
import {
  formatIdentifier,
  insertWithSequentialCode,
  nextSequentialCode,
  suggestNextCode,
  isValidIdentifier,
  numberMatches,
  parseIdentifier,
  studentPublicCode,
} from "@/features/education-catalog/identifiers";
import {
  courseCatalogKey,
  findSubjectDuplicates,
  levelScope,
  subjectCatalogKey,
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

describe("siglas soltas não valem como nome, em qualquer caixa", () => {
  it.each(["EM", "em", "Em", "le", "fq", "ef", "mat", "Filos.", "TICs"])("%s", (raw) => {
    expect(subjectCatalogKey(raw)).toBeNull();
  });

  it("nomes continuam a valer", () => {
    expect(subjectCatalogKey("Matemática")).toBe("MAT");
    expect(subjectCatalogKey("estudo do meio")).toBe("EM");
  });
});

describe("cursos", () => {
  it("respeita o nível: superior ou não superior", () => {
    expect(courseCatalogKey("Contabilidade", "higher")).not.toBe("TEC-CG");
    expect(courseCatalogKey("Contabilidade", "school")).toBe("TEC-CG");
    expect(courseCatalogKey("Gestão", "school")).not.toBe("LIC-GEST");
    expect(levelScope({ code: "ES", name: "Ensino Superior" })).toBe("higher");
    expect(levelScope({ code: "ESG2", name: "Ensino Secundário Geral — II Ciclo" })).toBe("school");
    expect(levelScope({ code: "LIC", name: "Licenciaturas" })).toBe("higher");
    expect(levelScope(null)).toBeNull();
  });

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
    // Aluno, matrícula e documento: «1» + ano + 4 dígitos, só dígitos.
    expect(formatIdentifier("enrollment", 123, { year: 2026 })).toBe("1260123");
    expect(formatIdentifier("document", 1, { year: 2027 })).toBe("1270001");
    expect(formatIdentifier("school", 1)).toBe("ESC-001");
    // O número do aluno é o que a base gera (CHECK ^1[0-9]{6}$).
    expect(formatIdentifier("student", 1, { year: 2026 })).toBe("1260001");
    expect(formatIdentifier("room", 7, { prefix: "LAB", padding: 2 })).toBe("LAB-07");
    // Passa do preenchimento sem cortar.
    expect(formatIdentifier("class_group", 12345)).toBe("T-12345");
  });

  it("recusa números inválidos", () => {
    expect(() => formatIdentifier("teacher", 0)).toThrow(RangeError);
    expect(() => formatIdentifier("teacher", 1.5)).toThrow(RangeError);
    expect(() => formatIdentifier("student", 10000, { year: 2026 })).toThrow(RangeError);
    expect(() => formatIdentifier("student", 1, { year: 1999 })).toThrow(RangeError);
  });

  it("lê e valida códigos", () => {
    expect(parseIdentifier("teacher", " doc-000012 ")).toEqual({ n: 12, code: "DOC-000012" });
    expect(parseIdentifier("teacher", "DOC-12")).toBeNull();
    expect(parseIdentifier("teacher", "F-0012")).toBeNull();
    expect(parseIdentifier("teacher", "DOC-000000")).toBeNull();
    expect(parseIdentifier("student", " 1260123 ")).toEqual({
      n: 123,
      year: 2026,
      code: "1260123",
    });
    expect(isValidIdentifier("student", "EST-000123")).toBe(false);
    expect(isValidIdentifier("student", "0000123")).toBe(false);
    expect(isValidIdentifier("student", "1260000")).toBe(false);
    expect(isValidIdentifier("student", "12600001")).toBe(false);
  });

  it("o código público do aluno continua com 7 dígitos", () => {
    expect(studentPublicCode("1260123", "00000000-0000-0000-0000-000000000000")).toBe("1260123");
    // Um número antigo que ainda não tenha sido renumerado continua a dar 7 dígitos.
    expect(studentPublicCode("EST-000123", "00000000-0000-0000-0000-000000000000")).toBe("0000123");
  });
});

describe("pesquisa por número", () => {
  it("ignora espaços, pontos e traços", () => {
    expect(numberMatches("1260123", "126 0123")).toBe(true);
    expect(numberMatches("1260123", "126-01")).toBe(true);
    expect(numberMatches("1260123", "0123")).toBe(true);
    expect(numberMatches("1260123", "")).toBe(true);
    expect(numberMatches("1260123", "125")).toBe(false);
    expect(numberMatches("FT-0001", "ft-00")).toBe(true);
    expect(numberMatches(null, "126")).toBe(false);
    // Poucos dígitos não comparam só dígitos: «1-2» não encontra tudo o que tem 12.
    expect(numberMatches("1260123", "1-2")).toBe(false);
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
