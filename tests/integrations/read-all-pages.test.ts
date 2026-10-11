import { describe, expect, it } from "vitest";
import { readAllPages } from "@/integrations/supabase/read-all-pages";

/** O PostgREST devolve no máximo 1000 linhas por pedido, sem erro. */
const table = Array.from({ length: 2500 }, (_, n) => ({ id: n }));
const capped = (from: number, to: number) =>
  Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + 1000)), error: null });

describe("readAllPages", () => {
  it("lê todas as linhas, para lá das primeiras 1000", async () => {
    const { data, error } = await readAllPages(capped);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(new Set(data.map((row) => row.id)).size).toBe(2500);
  });

  it("um erro numa página devolve o erro e nenhuma linha parcial", async () => {
    const { data, error } = await readAllPages((from, to) =>
      from >= 1000
        ? Promise.resolve({ data: null, error: { message: "timeout" } })
        : capped(from, to),
    );
    expect(error).toEqual({ message: "timeout" });
    expect(data).toEqual([]);
  });

  it("os pedidos do painel e das mensagens já não usam um limite acima de 1000", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/features/dashboard/server.ts",
      "src/features/integrations/server.ts",
      "src/features/academic/academic-structure.ts",
      "src/features/academic/exam-data.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\.limit\((?:[2-9]\d{3}|\d{5,})\)/);
    }
  });
});
