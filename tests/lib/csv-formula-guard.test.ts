import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { generateErrorReportCsv } from "@/features/import/server";

describe("exportações CSV protegidas contra fórmulas", () => {
  it("o relatório de erros da importação neutraliza fórmulas e escapa aspas", () => {
    const csv = generateErrorReportCsv([
      {
        sheet_name: '=HYPERLINK("http://x")',
        row_number: 2,
        raw_data: { nome: 'Ana "A"' },
        status: "error",
        errors: ["-1+1"],
        warnings: [],
      } as never,
    ]);
    const line = csv.split("\n")[1]!;
    expect(line.startsWith(`"'=HYPERLINK(""http://x"")"`)).toBe(true);
    expect(line).toContain(`"'-1+1"`);
    expect(line).toContain('""Ana \\""A\\""""');
  });

  it("todo o ficheiro que gera CSV no browser usa safeCell ou exportCsv", () => {
    const files = execSync("git ls-files src", { encoding: "utf8" })
      .split("\n")
      .filter((file) => /\.(ts|tsx)$/.test(file));
    const unsafe = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      const writesCsv = /new Blob\([^)]*text\/csv/.test(source.replace(/\s+/g, " "));
      if (!writesCsv) return false;
      // Os modelos oficiais em branco não levam dados de utilizadores.
      if (
        /generateOfficialCsvTemplate\(/.test(source) &&
        !/generateErrorReportCsv\(/.test(source)
      ) {
        return false;
      }
      return !/safeCell|exportCsv|generateErrorReportCsv/.test(source);
    });
    expect(unsafe).toEqual([]);
  });
});
