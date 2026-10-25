import { describe, expect, it } from "vitest";
import {
  angolaGradeScale,
  calculateDisciplineFinalAverage,
  calculateTrimesterAverage,
  normalizeScore,
  parsePautaScore,
  recursoFinal,
  scoreAverage,
  situacaoPauta,
} from "@/lib/angola-academic";
import { buildPautaExportRows } from "@/features/academic/pauta-export";
import { isSessionError } from "@/lib/session-expiry";

describe("Decreto 424/25 — normalizeScore", () => {
  it.each([
    [0, 0],
    [20, 20],
    [9.95, 10],
    [9.94, 9.9],
    ["12.34", 12.3],
  ])("normaliza %s → %s", (input, expected) => {
    expect(normalizeScore(input)).toBe(expected);
  });
  it.each([-0.1, 20.01, NaN, Infinity, "abc", null, undefined])("rejeita %s", (value) => {
    expect(normalizeScore(value)).toBeNull();
  });
});

describe("Decreto 424/25 — Média Trimestral MT = (MACT + NPT) / 2", () => {
  it("calcula a média com arredondamento a uma casa", () => {
    expect(calculateTrimesterAverage(13, 17)).toBe(15);
    expect(calculateTrimesterAverage(10, 9.5)).toBe(9.8);
    expect(calculateTrimesterAverage(9.9, 10)).toBe(10);
  });
  it("a NPP não entra directamente na MT (já está na MACT)", () => {
    expect(calculateTrimesterAverage(13, 17, 0)).toBe(15);
    expect(calculateTrimesterAverage(13, 17, 20)).toBe(15);
    expect(scoreAverage(13, 18, 17)).toBe(15);
  });
  it("limites da escala", () => {
    expect(calculateTrimesterAverage(0, 0)).toBe(0);
    expect(calculateTrimesterAverage(20, 20)).toBe(20);
  });
  it("degrada para o componente disponível", () => {
    expect(calculateTrimesterAverage(12, null)).toBe(12);
    expect(calculateTrimesterAverage(null, 8)).toBe(8);
    expect(calculateTrimesterAverage(null, null)).toBeNull();
    expect(calculateTrimesterAverage(25, 14)).toBe(14);
  });
});

describe("Decreto 424/25 — Média Final da Disciplina", () => {
  it("MFD = (MT1 + MT2 + MT3) / 3", () => {
    expect(calculateDisciplineFinalAverage(10, 12, 14)).toBe(12);
    expect(calculateDisciplineFinalAverage(9.5, 9.5, 10.5)).toBe(9.8);
  });
  it("usa só os trimestres disponíveis", () => {
    expect(calculateDisciplineFinalAverage(10, null, 14)).toBe(12);
    expect(calculateDisciplineFinalAverage(null, null, null)).toBeNull();
  });
});

describe("Decreto 424/25 — situação e recurso", () => {
  it("transita a partir de 10 (limite inclusivo)", () => {
    expect(angolaGradeScale.passing).toBe(10);
    expect(situacaoPauta(10).label).toBe("Transita");
    expect(situacaoPauta(9.9).label).toBe("Não transita");
    expect(situacaoPauta(NaN).label).toBe("—");
  });
  it("recurso faz média com a nota original", () => {
    expect(recursoFinal(8, 12)).toBe(10);
    expect(recursoFinal(null, 12)).toBe(12);
    expect(recursoFinal(8, null)).toBe(8);
  });
  it("parsePautaScore aceita vírgula e rejeita fora da escala", () => {
    expect(parsePautaScore("12,5")).toBe(12.5);
    expect(parsePautaScore("")).toBeNull();
    expect(parsePautaScore("21")).toBeNaN();
    expect(parsePautaScore("-1")).toBeNaN();
  });
});

describe("Exportação de pautas", () => {
  const base = { class_group_id: "c1", registration_number: null };
  const grades = [
    {
      ...base,
      enrollment_id: "e1",
      student_name: "Beatriz",
      subject_id: "mat",
      subject_name: "Matemática",
      term: 1,
      average: 9,
    },
    {
      ...base,
      enrollment_id: "e1",
      student_name: "Beatriz",
      subject_id: "mat",
      subject_name: "Matemática",
      term: 2,
      average: 11,
    },
    {
      ...base,
      enrollment_id: "e1",
      student_name: "Beatriz",
      subject_id: "por",
      subject_name: "Português",
      term: 1,
      average: 14,
    },
    {
      ...base,
      enrollment_id: "e2",
      student_name: "Ana",
      subject_id: "mat",
      subject_name: "Matemática",
      term: 1,
      average: 8,
    },
  ];
  it("filtra por período e disciplinas e ordena por nome", () => {
    const rows = buildPautaExportRows(grades, ["mat"], 1);
    expect(rows.map((r) => r.student_name)).toEqual(["Ana", "Beatriz"]);
    expect(rows[1]!.scores["mat"]).toBe(9);
    // Num trimestre não se decide transição: isso é uma decisão anual. O rótulo é o
    // mesmo que a tabela do ecrã de Relatórios Académicos usa.
    expect(rows[0]!.situation).toBe("Em recuperação");
    expect(rows[1]!.situation).toBe("Em recuperação");
  });
  it("a pauta anual não inventa a MFD de um ano a meio", () => {
    // Beatriz tem Matemática no 1.º e 2.º trimestre e Português só no 1.º: nenhuma das
    // duas disciplinas tem os 3 períodos, por isso não há MFD nem veredicto.
    const rows = buildPautaExportRows(grades, ["mat", "por"], "anual");
    const beatriz = rows.find((r) => r.enrollment_id === "e1")!;
    expect(beatriz.scores["mat"]).toBeNull();
    expect(beatriz.scores["por"]).toBeNull();
    expect(beatriz.average).toBeNull();
    expect(beatriz.situation).toBe("—");
  });
  it("com os 3 períodos lançados dá a MFD e o veredicto do motor", () => {
    const completos = [
      ...grades,
      {
        ...base,
        enrollment_id: "e1",
        student_name: "Beatriz",
        subject_id: "mat",
        subject_name: "Matemática",
        term: 3,
        average: 13,
      },
      {
        ...base,
        enrollment_id: "e1",
        student_name: "Beatriz",
        subject_id: "por",
        subject_name: "Português",
        term: 2,
        average: 14,
      },
      {
        ...base,
        enrollment_id: "e1",
        student_name: "Beatriz",
        subject_id: "por",
        subject_name: "Português",
        term: 3,
        average: 14,
      },
    ];
    const rows = buildPautaExportRows(completos, ["mat", "por"], "anual");
    const beatriz = rows.find((r) => r.enrollment_id === "e1")!;
    expect(beatriz.scores["mat"]).toBe(11);
    expect(beatriz.scores["por"]).toBe(14);
    expect(beatriz.average).toBe(12.5);
    expect(beatriz.situation).toBe("TRANSITA");
  });
  it("aplica o limite de disciplinas em falta do ciclo, e não a média sozinha", () => {
    // Média 12 com 1 disciplina abaixo: transita no I Ciclo (tolera 2) e não no II (tolera 0).
    const notas = ["a", "b", "c", "d"].flatMap((subject, i) =>
      [1, 2, 3].map((term) => ({
        ...base,
        enrollment_id: "e9",
        student_name: "Carlos",
        subject_id: subject,
        subject_name: subject.toUpperCase(),
        term,
        average: i === 0 ? 6 : 14,
      })),
    );
    const ids = ["a", "b", "c", "d"];
    expect(buildPautaExportRows(notas, ids, "anual", { cycle: "i_ciclo" })[0]!.situation).toBe(
      "TRANSITA",
    );
    expect(buildPautaExportRows(notas, ids, "anual", { cycle: "ii_ciclo" })[0]!.situation).toBe(
      "ADMITIDO A EXAME",
    );
  });
  it("respeita a nota mínima da escola e o regime de 2 períodos", () => {
    const doisPeriodos = [1, 2].map((term) => ({
      ...base,
      enrollment_id: "e5",
      student_name: "Dina",
      subject_id: "mat",
      subject_name: "Matemática",
      term,
      average: 12,
    }));
    const rows = buildPautaExportRows(doisPeriodos, ["mat"], "anual", {
      periodCount: 2,
      passing: 14,
    });
    expect(rows[0]!.scores["mat"]).toBe(12);
    // 12 chega para a escala angolana (10) e não para uma escola que exija 14.
    expect(rows[0]!.situation).toBe("NÃO TRANSITA");
  });
});

describe("Sessão expirada", () => {
  it("reconhece erros de sessão", () => {
    expect(
      isSessionError(new Error("Unauthorized: sessão em falta. Termine e volte a entrar.")),
    ).toBe(true);
    expect(isSessionError(new Error("JWT expired"))).toBe(true);
    expect(isSessionError({ status: 401 })).toBe(true);
    expect(isSessionError(new Error("Não foi possível carregar as notas."))).toBe(false);
  });
});
