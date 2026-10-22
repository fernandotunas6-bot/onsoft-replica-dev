import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/calendar/server.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("calendário lectivo", () => {
  it("um período só entra num ano lectivo desta escola", () => {
    const create = handler("createCalendarEvent");
    expect(create).toContain('if (!ownYear) throw new Error("Ano lectivo não encontrado.")');
  });

  it("criação e activação usam a mesma operação transaccional", () => {
    const create = handler("createAcademicYear");
    expect(create).toContain('"siga_save_active_academic_year"');
    expect(create).not.toContain('.from("academic_years")');
  });
});
