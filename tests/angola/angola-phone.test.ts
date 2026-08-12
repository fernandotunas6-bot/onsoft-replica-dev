import { describe, expect, it } from "vitest";
import { normalizeAngolaPhone, validateAngolaPhone, formatAngolaPhone } from "@/lib/angola-phone";
import { normalizePersonPhone } from "@/features/people/schemas";

describe("normalizeAngolaPhone", () => {
  it("normaliza número local de 9 dígitos para E.164", () => {
    expect(normalizeAngolaPhone("923456789")).toBe("+244923456789");
    expect(normalizeAngolaPhone("912 345 678")).toBe("+244912345678");
  });

  it("aceita número com prefixo 244", () => {
    expect(normalizeAngolaPhone("244923456789")).toBe("+244923456789");
    expect(normalizeAngolaPhone("+244923456789")).toBe("+244923456789");
  });

  it("devolve o valor sem alterar quando não reconhece o padrão", () => {
    expect(normalizeAngolaPhone("123")).toBe("123");
  });
});

describe("validateAngolaPhone", () => {
  it("aceita números móveis angolanos válidos", () => {
    expect(validateAngolaPhone("+244923456789").ok).toBe(true);
    expect(validateAngolaPhone("923456789").ok).toBe(true);
  });

  it("rejeita números sem o prefixo 9XX", () => {
    expect(validateAngolaPhone("+244123456789").ok).toBe(false);
    expect(validateAngolaPhone("+351912345678").ok).toBe(false);
    expect(validateAngolaPhone("").ok).toBe(false);
  });

  it("devolve o número compacto em E.164 quando válido", () => {
    const result = validateAngolaPhone("912 345 678");
    expect(result.ok).toBe(true);
    expect(result.compact).toBe("+244912345678");
  });
});

describe("formatAngolaPhone", () => {
  it("formata com espaços no estilo angolano", () => {
    expect(formatAngolaPhone("+244923456789")).toBe("+244 923 456 789");
    expect(formatAngolaPhone("912345678")).toBe("+244 912 345 678");
  });

  it("devolve o valor sem alterar quando inválido", () => {
    expect(formatAngolaPhone("abc")).toBe("abc");
  });
});

describe("normalizePersonPhone", () => {
  it("normaliza e.164 para persistência", () => {
    expect(normalizePersonPhone("912 345 678")).toBe("+244912345678");
    expect(normalizePersonPhone("+244 912 345 678")).toBe("+244912345678");
  });

  it("devolve null quando vazio", () => {
    expect(normalizePersonPhone("")).toBeNull();
    expect(normalizePersonPhone(null)).toBeNull();
  });

  it("mantém valor inválido sem cortar (não perde dados)", () => {
    const result = normalizePersonPhone("351912345678");
    expect(result).toBe("351912345678");
  });
});
