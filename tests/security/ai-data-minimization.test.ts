import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/ai-assist/ai-assist.functions.ts"),
  "utf8",
);

describe("IA: dados mínimos e limite de uso", () => {
  it("a análise de risco não envia o nome dos alunos ao serviço externo", () => {
    const start = source.indexOf("const compact = data.students.map(");
    const block = source.slice(start, source.indexOf("}));", start));
    expect(block).toMatch(/id: aliasOf\.get\(s\.enrollment_id\)/);
    expect(block).not.toMatch(/s\.name/);
    expect(block).not.toMatch(/enrollment_id,/);
  });

  it("os nomes são repostos no servidor a partir do pseudónimo", () => {
    expect(source).toMatch(/byAlias\.get\(/);
    expect(source).toMatch(/name: student!\.name/);
  });

  it("cada chamada à IA passa pelo limite por conta", () => {
    const calls = source.match(/runAiText\(/g)?.length ?? 0;
    const limits = source.match(/assertAiRateLimit\(context\.userId\)/g)?.length ?? 0;
    expect(calls).toBeGreaterThan(0);
    expect(limits).toBe(calls);
  });
});
