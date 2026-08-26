import { describe, expect, it } from "vitest";
import {
  resolveGradingProfile,
  calculateComponentGrade,
  calculateCreditWeightedAverage,
  scoreToLetterGrade,
  scoreToGpaPoints,
  calculateGpa,
  calculateFinalAverage,
  passingThreshold,
  DEFAULT_SUPERIOR_GRADING_PROFILE,
} from "@/features/academic/grading-profiles";

describe("SIGA GradingProfiles — motor de notas configurável do Ensino Superior", () => {
  it("sugere 0–20+ECTS e Frequência+Exame quando nada foi configurado", () => {
    expect(resolveGradingProfile({})).toEqual(DEFAULT_SUPERIOR_GRADING_PROFILE);
  });

  it("o curso sobrepõe-se ao valor por omissão da escola", () => {
    const profile = resolveGradingProfile({
      schoolDefault: { scale: "20_ects", components: "frequencia_exame" },
      courseOverride: { scale: "gpa4", components: "so_exame" },
    });
    expect(profile).toEqual({ scale: "gpa4", components: "so_exame" });
  });

  it("a escola sobrepõe-se à sugestão quando não há override de curso", () => {
    const profile = resolveGradingProfile({
      schoolDefault: { scale: "gpa4", components: "so_exame" },
    });
    expect(profile).toEqual({ scale: "gpa4", components: "so_exame" });
  });

  it("calcula a nota da disciplina: Frequência 40% + Exame 60%", () => {
    expect(calculateComponentGrade("frequencia_exame", 14, 16)).toBe(15.2);
    expect(calculateComponentGrade("frequencia_exame", null, 16)).toBe(16);
    expect(calculateComponentGrade("frequencia_exame", 14, null)).toBe(14);
  });

  it("calcula a nota da disciplina: só Exame Final", () => {
    expect(calculateComponentGrade("so_exame", 14, 16)).toBe(16);
    expect(calculateComponentGrade("so_exame", 14, null)).toBeNull();
  });

  it("calcula a média ponderada por créditos ECTS na escala 0–20", () => {
    const media = calculateCreditWeightedAverage([
      { score: 16, credits: 6 },
      { score: 10, credits: 3 },
    ]);
    // (16*6 + 10*3) / 9 = 14
    expect(media).toBe(14);
  });

  it("converte nota 0–20 em nota-letra segundo as bandas angolanas/portuguesas", () => {
    expect(scoreToLetterGrade(19)).toBe("A");
    expect(scoreToLetterGrade(16)).toBe("B");
    expect(scoreToLetterGrade(14)).toBe("C");
    expect(scoreToLetterGrade(10)).toBe("D");
    expect(scoreToLetterGrade(9.9)).toBe("F");
  });

  it("converte nota-letra em pontos GPA (A=4.0 … F=0)", () => {
    expect(scoreToGpaPoints(19)).toBe(4.0);
    expect(scoreToGpaPoints(9)).toBe(0);
  });

  it("calcula o GPA ponderado por créditos", () => {
    const gpa = calculateGpa([
      { score: 19, credits: 6 }, // A = 4.0
      { score: 11, credits: 3 }, // D = 1.0
    ]);
    // (4.0*6 + 1.0*3) / 9 = 3.0
    expect(gpa).toBe(3.0);
  });

  it("calculateFinalAverage escolhe a agregação certa consoante a escala do perfil", () => {
    const items = [
      { score: 16, credits: 6 },
      { score: 10, credits: 3 },
    ];
    expect(calculateFinalAverage({ scale: "20_ects", components: "frequencia_exame" }, items)).toBe(
      14,
    );
    expect(
      calculateFinalAverage({ scale: "gpa4", components: "frequencia_exame" }, items),
    ).toBeCloseTo((3.0 * 6 + 1.0 * 3) / 9, 2);
  });

  it("a nota mínima de aprovação depende da escala", () => {
    expect(passingThreshold({ scale: "20_ects", components: "frequencia_exame" })).toBe(10);
    expect(passingThreshold({ scale: "gpa4", components: "frequencia_exame" })).toBe(2.0);
  });
});
