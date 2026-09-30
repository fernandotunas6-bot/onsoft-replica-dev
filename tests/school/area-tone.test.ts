import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { areaToneForPath } from "@/lib/area-tone";

describe("tom visual por área", () => {
  it("cada área tem o seu tom, com o prefixo mais específico primeiro", () => {
    expect(areaToneForPath("/pedagogica")).toBe("pedagogica");
    expect(areaToneForPath("/financeiro")).toBe("financeiro");
    expect(areaToneForPath("/financeiro/rh/folha")).toBe("rh");
    expect(areaToneForPath("/alunos/123")).toBe("secretaria");
    expect(areaToneForPath("/comunicacoes")).toBe("comunicacao");
    expect(areaToneForPath("/configuracoes/assinatura")).toBe("sistema");
    expect(areaToneForPath("/relatorios/financeiros")).toBe("financeiro");
    expect(areaToneForPath("/relatorios/academicos")).toBe("pedagogica");
  });

  it("o painel e caminhos desconhecidos ficam no tom da marca", () => {
    expect(areaToneForPath("/")).toBe("marca");
    expect(areaToneForPath("/qualquer-coisa")).toBe("marca");
    // Prefixo parecido não conta: /financeiro-x não é o Financeiro.
    expect(areaToneForPath("/financeiros")).toBe("marca");
  });

  it("todos os tons usados têm cores definidas no CSS", () => {
    const css = readFileSync(resolve(__dirname, "../../src/styles.css"), "utf8");
    const tones = new Set(
      [
        "/",
        "/pedagogica",
        "/financeiro",
        "/financeiro/rh",
        "/alunos",
        "/comunicacoes",
        "/configuracoes",
      ].map(areaToneForPath),
    );
    for (const tone of tones) expect(css, tone).toContain(`[data-tone="${tone}"]`);
  });
});
