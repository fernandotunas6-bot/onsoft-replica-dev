import { describe, expect, it } from "vitest";
import {
  defaultYearsFor,
  higherEdProgramCode,
  normalizeProgramCode,
  programYears,
} from "@/features/higher-ed/program-shape";

describe("forma do curso superior", () => {
  it("normaliza o código sem acentos nem espaços", () => {
    expect(normalizeProgramCode(" eng. informática ")).toBe("ENG-INFORMATICA");
    expect(normalizeProgramCode("Direito")).toBe("DIREITO");
    expect(normalizeProgramCode("--")).toBe("");
  });

  it("anos com os códigos dos modelos de estrutura («1ANO», único dentro do curso)", () => {
    expect(programYears("ES-LIC", 5).map((g) => g.code)).toEqual([
      "1ANO",
      "2ANO",
      "3ANO",
      "4ANO",
      "5ANO",
    ]);
    expect(higherEdProgramCode("Direito")).toBe("ES-DIREITO");
    expect(higherEdProgramCode("ES-DIR")).toBe("ES-DIR");
    expect(programYears("DIR", 0)).toHaveLength(1);
    expect(programYears("DIR", 20)).toHaveLength(7);
  });

  it("licenciatura 4 anos e mestrado 2 por omissão", () => {
    expect(defaultYearsFor("undergraduate")).toBe(4);
    expect(defaultYearsFor("postgraduate")).toBe(2);
  });

  it("o nome do ano leva o código do curso e continua a ser reconhecido como Superior", () => {
    expect(programYears("ES-DIREITO", 2).map((g) => g.name)).toEqual([
      "1º Ano · DIREITO",
      "2º Ano · DIREITO",
    ]);
  });
});
