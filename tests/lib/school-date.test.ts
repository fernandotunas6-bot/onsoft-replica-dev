import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schoolTodayIso } from "@/lib/school-date";

describe("schoolTodayIso — «hoje» na escola, não em UTC", () => {
  it("entre a meia-noite e a 01:00 de Luanda já é o dia seguinte ao de UTC", () => {
    expect(schoolTodayIso(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
  });
  it("durante o dia coincide com UTC", () => {
    expect(schoolTodayIso(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
  });
  it("aceita outro fuso explícito", () => {
    expect(schoolTodayIso(new Date("2026-10-04T23:30:00Z"), "UTC")).toBe("2026-10-04");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("nenhum «hoje» calculado em UTC no código", () => {
  it("usa schoolTodayIso() em vez de new Date().toISOString().slice(0, 10)", () => {
    // Pagamentos, chamadas e matrículas feitos entre a meia-noite e a 01:00 de Luanda
    // ficavam com a data de ontem (45 ocorrências corrigidas a 2026-10-05).
    const pattern = "new Date().toISOString().slice(0, 10)";
    const offenders = sourceFiles("src")
      .filter((file) => !file.endsWith(join("lib", "school-date.ts")))
      .filter((file) => readFileSync(file, "utf8").includes(pattern));
    expect(offenders).toEqual([]);
  });
});
