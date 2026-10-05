import { describe, expect, it } from "vitest";
import {
  HIGHER_ED_DEGREES,
  parseProgramProfile,
  programKindForDegree,
} from "@/features/school/settings-domains";
import { DEGREE_TITLE } from "@/features/higher-ed/engine";

describe("graus do Ensino Superior", () => {
  it("bacharelato e licenciatura são graduação; os outros, pós-graduação", () => {
    expect(programKindForDegree("bacharelato")).toBe("undergraduate");
    expect(programKindForDegree("licenciatura")).toBe("undergraduate");
    expect(programKindForDegree("mestrado")).toBe("postgraduate");
    expect(programKindForDegree("doutoramento")).toBe("postgraduate");
    expect(programKindForDegree("especializacao")).toBe("postgraduate");
  });

  it("o perfil guardado aceita o bacharelato e recusa graus desconhecidos", () => {
    expect(parseProgramProfile({ degree: "bacharelato" }).degree).toBe("bacharelato");
    expect(parseProgramProfile({ degree: "tecnico" }).degree).toBe("licenciatura");
  });

  it("o certificado do bacharelato confere o grau de Bacharel", () => {
    expect(DEGREE_TITLE.bacharelato).toBe("Bacharel");
    expect(HIGHER_ED_DEGREES).toContain("bacharelato");
  });
});
