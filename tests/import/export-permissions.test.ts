import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("exportação de dados da escola", () => {
  const source = readFileSync("src/features/import/server.ts", "utf8");
  const exporter = source.slice(source.indexOf("export const exportSchoolDataFn"));

  it("cada módulo exige os mesmos cargos da importação", () => {
    expect(exporter).toContain("rolesForModule(module).some((role) => roles.includes(role))");
    expect(exporter.indexOf("Sem permissão para exportar")).toBeLessThan(
      exporter.indexOf("exportSchoolData(db"),
    );
  });

  it("fica registada na auditoria antes de devolver o ficheiro", () => {
    const audit = exporter.indexOf('action: "school_data.exported"');
    expect(audit).toBeGreaterThan(-1);
    expect(audit).toBeLessThan(exporter.indexOf('base64: result.buffer.toString("base64")'));
  });
});
