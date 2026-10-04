import { describe, expect, it } from "vitest";
import { rankAccessCandidates } from "@/features/higher-ed/access";

const c = (id: string, status: string, score: number | null, createdAt = "2026-01-01") => ({
  id,
  status,
  score,
  createdAt,
});

describe("seriação do acesso", () => {
  it("aceites ocupam vaga; depois por nota; empate pela data", () => {
    const ranked = rankAccessCandidates(
      [
        c("a", "accepted", null),
        c("b", "pending", 12),
        c("c", "pending", 15),
        c("d", "pending", 12, "2025-12-01"),
        c("e", "pending", 9),
        c("f", "pending", null),
      ],
      3,
    );
    const by = Object.fromEntries(ranked.map((r) => [r.id, r.placement]));
    expect(by).toEqual({
      a: "aceite",
      c: "dentro_das_vagas",
      d: "dentro_das_vagas",
      b: "suplente",
      e: "excluido",
      f: "sem_nota",
    });
    expect(ranked.find((r) => r.id === "d")!.position).toBe(2);
  });

  it("vagas 0 = sem limite", () => {
    const ranked = rankAccessCandidates([c("x", "pending", 11), c("y", "pending", 18)], 0);
    expect(ranked.every((r) => r.placement === "dentro_das_vagas")).toBe(true);
  });
});
