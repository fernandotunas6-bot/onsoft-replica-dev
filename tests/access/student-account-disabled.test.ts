import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/features/students/student-accounts-server.ts", "utf8");
const page = readFileSync("src/features/students/components/StudentAccountsPage.tsx", "utf8");

describe("suspensão de login do aluno", () => {
  const block = server.slice(
    server.indexOf("export const setStudentAccountDisabled"),
    server.indexOf("async function assertStudentOnlyAccount"),
  );

  it("exige autenticação forte, papel administrativo e vínculo na escola", () => {
    expect(block).toContain("requireAal2(");
    expect(block).toContain("requireSgaWriterForWrite(");
    expect(block).toContain("assertStudentOnlyAccount(db, actor.schoolId, userId)");
    expect(block).toContain('.eq("school_id", actor.schoolId)');
    expect(block).toContain("if (userId === context.userId)");
  });

  it("altera apenas o vínculo do login sem apagar matrícula, pessoa ou notas", () => {
    expect(block).toContain('data.disabled ? "suspended" : "active"');
    expect(block).toContain('.from("school_memberships")');
    expect(block).toContain("recordAccessAudit(");
    expect(block).not.toContain('.from("students").update');
    expect(block).not.toContain("deleteUser");
  });

  it("tem controlo de bloqueio e reactivação com confirmação", () => {
    expect(page).toContain("setStudentAccountDisabled");
    expect(page).toContain("accountSuspended");
    expect(page).toContain("toggleStudentAccess(");
    expect(page).toContain("window.confirm(");
  });
});
