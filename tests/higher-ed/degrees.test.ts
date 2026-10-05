import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEGREE_TITLE } from "@/features/higher-ed/engine";
import {
  HIGHER_ED_DEGREES,
  parseProgramProfile,
  programKindForDegree,
} from "@/features/school/settings-domains";

/** Graus do Ensino Superior; o bacharelato entrou a 2026-10-05 (Lei 32/20). */
describe("graus do Ensino Superior", () => {
  it("bacharelato: grau de graduação, título «Bacharel», sem mudar a base", () => {
    expect(HIGHER_ED_DEGREES).toContain("bacharelato");
    expect(parseProgramProfile({ degree: "bacharelato" }).degree).toBe("bacharelato");
    expect(DEGREE_TITLE.bacharelato).toBe("Bacharel");
    // programs.kind só aceita os valores que a produção já tem.
    expect(programKindForDegree("bacharelato")).toBe("undergraduate");
    expect(programKindForDegree("licenciatura")).toBe("undergraduate");
    for (const degree of ["mestrado", "doutoramento", "especializacao"] as const) {
      expect(programKindForDegree(degree)).toBe("postgraduate");
    }
  });

  it("um grau desconhecido lê-se como licenciatura", () => {
    expect(parseProgramProfile({ degree: "tecnico_superior" }).degree).toBe("licenciatura");
  });

  it("servidor e ecrã usam a mesma lista e a mesma regra do tipo do curso", () => {
    const server = readFileSync("src/features/higher-ed/server.ts", "utf8");
    expect(server).toContain("degree: z.enum(HIGHER_ED_DEGREES)");
    expect(server).toContain("const kindForDegree = programKindForDegree;");
    expect(server).toMatch(/const DEGREE_TEXT = \{\s*bacharelato: "Bacharelato",/);
    const route = readFileSync("src/routes/pedagogica_.superior.tsx", "utf8");
    expect(route).toContain("kind: programKindForDegree(form.degree)");
    expect(route).not.toContain('form.degree === "licenciatura"');
  });
});
