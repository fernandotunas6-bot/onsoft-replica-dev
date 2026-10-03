import { describe, expect, it } from "vitest";
import {
  defaultYearsFor,
  normalizeProgramCode,
  programYears,
} from "@/features/higher-ed/program-shape";

describe("forma do curso superior", () => {
  it("normaliza o código sem acentos nem espaços", () => {
    expect(normalizeProgramCode(" eng. informática ")).toBe("ENG-INFORMATICA");
    expect(normalizeProgramCode("Direito")).toBe("DIREITO");
    expect(normalizeProgramCode("--")).toBe("");
  });

  it("cria os anos curriculares com o mesmo código do seed («1ANO-LIC»)", () => {
    expect(programYears("LIC", 5).map((g) => g.code)).toEqual([
      "1ANO-LIC",
      "2ANO-LIC",
      "3ANO-LIC",
      "4ANO-LIC",
      "5ANO-LIC",
    ]);
    expect(programYears("DIR", 0)).toHaveLength(1);
    expect(programYears("DIR", 20)).toHaveLength(7);
  });

  it("licenciatura 4 anos e mestrado 2 por omissão", () => {
    expect(defaultYearsFor("undergraduate")).toBe(4);
    expect(defaultYearsFor("postgraduate")).toBe(2);
  });
});
