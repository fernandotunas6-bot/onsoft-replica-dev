import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Auditoria 13: o detalhe da pauta lê as faltas da chamada ao vivo. Uma chamada,
 * correcção ou justificação aprovada num período com pauta oficial mudava a
 * percentagem de faltas de uma pauta já homologada ou publicada.
 */
const source = readFileSync("src/features/pedagogica/attendance-server.ts", "utf8");
const body = (name: string) => {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  return source.slice(start, source.indexOf("export const", start + 1));
};

describe("presenças num período com pauta oficial", () => {
  it("a chamada e a correcção verificam a pauta antes de gravar", () => {
    for (const name of ["submitAttendanceCallBatch", "editFinalizedAttendanceCall"]) {
      const fn = body(name);
      const check = fn.indexOf("assertAttendanceNotLocked(db, membership.schoolId");
      expect(check, name).toBeGreaterThan(-1);
      expect(check, name).toBeLessThan(fn.indexOf('.from("siga_attendance_records").upsert'));
    }
  });

  it("aprovar uma justificação verifica a pauta antes de decidir", () => {
    const fn = body("reviewAttendanceJustification");
    const check = fn.indexOf("assertAttendanceNotLocked(db, membership.schoolId");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(
      fn.indexOf('.from("siga_attendance_justifications")\n      .update'),
    );
  });

  it("usa os mesmos estados oficiais das notas", () => {
    const helper = source.slice(source.indexOf("async function assertAttendanceNotLocked"));
    const fn = helper.slice(0, helper.indexOf("\n}\n"));
    expect(fn).toContain("LOCKED_SHEET_STATUSES");
    expect(fn).toContain('sheet.kind === "annual"');
  });
});
