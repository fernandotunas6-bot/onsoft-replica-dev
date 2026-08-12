import { describe, expect, it } from "vitest";
import {
  formatAngolaBi,
  normalizeAngolaIdentity,
  normalizePersonNif,
  validateAngolaBi,
  validateAngolaNif,
  validateSchoolNif,
} from "@/lib/angola-identity";

describe("validateAngolaBi", () => {
  it("aceita BI válido", () => {
    expect(validateAngolaBi("000204688CA010").ok).toBe(true);
    expect(validateAngolaBi("000 204 688 CA 010").compact).toBe("000204688CA010");
  });

  it("rejeita formato incorrecto", () => {
    expect(validateAngolaBi("123").ok).toBe(false);
  });
});

describe("validateAngolaNif", () => {
  it("distingue singular e entidade", () => {
    expect(validateAngolaNif("000204688CA010").kind).toBe("individual");
    expect(validateAngolaNif("5419011735").kind).toBe("entity");
  });
});

describe("validateSchoolNif", () => {
  it("aceita NIF de entidade e legado", () => {
    expect(validateSchoolNif("5419011735").ok).toBe(true);
    expect(validateSchoolNif("5000123456").ok).toBe(true);
  });
});

describe("formatAngolaBi", () => {
  it("formata grupos legíveis", () => {
    expect(formatAngolaBi("000204688CA010")).toContain("CA");
    expect(normalizeAngolaIdentity("009806566LA045")).toBe("009806566LA045");
  });
});

describe("normalizePersonNif", () => {
  it("compacta BI e NIF de entidade", () => {
    expect(normalizePersonNif("000 204 688 CA 010")).toBe("000204688CA010");
    expect(normalizePersonNif("5419011735")).toBe("5419011735");
    expect(normalizePersonNif("")).toBeNull();
  });
});
