import { describe, expect, it } from "vitest";
import {
  createClassGroupInputSchema,
  normalizeClassGroupCode,
  updateClassGroupInputSchema,
  updateRoomInputSchema,
} from "@/features/academic/schemas";

/**
 * `class_groups_code_check` exige `^[A-Z0-9_-]{2,30}$`. O formulário aceitava
 * "10ª C" e a base recusava a turma com um erro genérico.
 */
describe("código da turma", () => {
  it("normaliza para o formato que a base aceita", () => {
    expect(normalizeClassGroupCode("10ª C")).toBe("10-C");
    expect(normalizeClassGroupCode(" 12ª classe / Informática ")).toBe("12-CLASSE-INFORMATICA");
    expect(normalizeClassGroupCode("7a")).toBe("7A");
    expect(normalizeClassGroupCode("10A_cfb")).toBe("10A_CFB");
  });

  const base = {
    academicYearId: "00000000-0000-4000-8000-000000000001",
    gradeLevelId: "00000000-0000-4000-8000-000000000002",
    name: "10ª C",
    shift: "morning" as const,
  };

  it("o esquema grava o código normalizado", () => {
    expect(createClassGroupInputSchema.parse({ ...base, code: "10ª c" }).code).toBe("10-C");
  });

  it("recusa códigos que a base recusaria, com mensagem em português", () => {
    const result = createClassGroupInputSchema.safeParse({ ...base, code: "Ç" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("Código da turma");
  });

  it("editar sem estado não reactiva uma turma arquivada", () => {
    const parsed = updateClassGroupInputSchema.parse({
      id: "00000000-0000-4000-8000-000000000003",
      code: "10C",
      name: "10ª C",
      shift: "morning",
    });
    expect(parsed.status).toBeUndefined();
    expect(parsed.roomId).toBeUndefined();
  });
});

describe("edição de sala", () => {
  it("texto vazio limpa a coluna; ausente não mexe", () => {
    const parsed = updateRoomInputSchema.parse({
      id: "00000000-0000-4000-8000-000000000004",
      block: "",
      floor: "  ",
    });
    expect(parsed.block).toBeNull();
    expect(parsed.floor).toBeNull();
    expect(parsed.building).toBeUndefined();
  });
});
