import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pedidos de alteração de nota", () => {
  const source = readFileSync("src/features/academic/grade-change-requests.ts", "utf8");
  const request = source.slice(
    source.indexOf("export const requestGradeChange"),
    source.indexOf("export type GradeChangeRequest"),
  );
  const decide = source.slice(source.indexOf("export const decideGradeChange"));

  it("o pedido só é registado se a nota continuar sem pedido pendente", () => {
    expect(request).toContain('.is("pending_score", null)');
    expect(request).toContain("if (!claimed?.length)");
  });

  it("aprovar sem caderneta ou sem ler as pautas é recusado", () => {
    expect(decide).toContain("if (!book) throw new Error");
    expect(decide).toContain("if (sheetsError && !isMissing(sheetsError.message))");
  });

  it("a decisão é atómica e vem antes do histórico", () => {
    const update = decide.indexOf('.eq("pending_score", score.pending_score)');
    expect(update).toBeGreaterThan(-1);
    expect(decide).toContain(
      'if (!decided?.length) throw new Error("Este pedido já foi decidido.")',
    );
    expect(update).toBeLessThan(decide.indexOf('.from("grade_score_history").insert'));
  });

  it("se o histórico falhar, a nota e o pedido são repostos", () => {
    const history = decide.slice(decide.indexOf('.from("grade_score_history").insert'));
    expect(history).toContain("score: score.score");
    expect(history).toContain("pending_score: score.pending_score");
  });
});
