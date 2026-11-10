import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("menus de contas por escola", () => {
  const menu = read("src/features/access/AccountRowActions.tsx");
  const bulk = read("src/features/access/AccountBulkActions.tsx");
  const route = read("src/routes/acessos.tsx");

  it("monta o menu por conta, sem apagar a identidade global", () => {
    expect(route).toContain("<AccountRowActions");
    expect(menu).toContain("aria-label={`Mais acções para ${account.full_name}`}");
    expect(menu).toContain("setSystemAccountDisabled(");
    expect(menu).not.toMatch(/deleteUser\(|\.from\("profiles"\)\.delete/);
    expect(menu).toContain("Esta acção suspende o vínculo");
  });

  it("restringe a definição directa de senha e bloqueio ao Administrador", () => {
    expect(menu).toContain("{canAdminister ?");
    expect(menu).toContain("resetStaffPasswordDirect");
    expect(menu).toContain("passwordMeetsPolicy(password)");
    expect(menu).toContain("!account.is_self");
  });

  it("processa selecções sem tentar mudar contas de outra escola", () => {
    expect(route).toContain("<AccountBulkActions");
    expect(route).toContain('queryKey: ["access", "accounts", currentUser.schoolId]');
    expect(bulk).toContain("accounts.filter((item) => selectedIds.includes(item.id))");
    expect(bulk).toContain("setSystemAccountDisabled");
    expect(bulk).toContain("target.length > 25");
    expect(bulk).toContain("window.confirm");
    expect(bulk).toContain("mailto:?bcc=");
  });
});

describe("alunos: acções individuais e lote", () => {
  const route = read("src/routes/alunos/index.tsx");
  const row = read("src/features/students/components/StudentRowActions.tsx");
  const bulk = read("src/features/students/components/StudentBulkTools.tsx");

  it("oferece menu na lista sem substituir os fluxos académicos existentes", () => {
    expect(route).toContain("<StudentRowActions");
    expect(route).toContain("<StudentBulkTools");
    expect(route).toContain('queryKey: ["students", "search", currentAccount.schoolId]');
    expect(route).toContain("batchAssignClass");
    expect(route).toContain("batchUpdateStudentStatus");
    expect(row).toContain('search={{ secao: "financeiro" }}');
    expect(row).toContain('search={{ secao: "academico" }}');
    expect(row).toContain('to="/pessoas/acessos-alunos"');
  });

  it("selecção por página só considera os alunos dessa página", () => {
    expect(route).toContain("paged.every((student) => selectedIds.includes(student.id))");
  });

  it("não envia e-mails automaticamente nem grava notas ou cobranças em lote", () => {
    expect(bulk).toContain("mailto:?bcc=");
    expect(bulk).toContain("seleccionados-cobranca");
    expect(bulk).toContain("Esta selecção não é transmitida automaticamente");
    expect(bulk).not.toContain("issueInvoice(");
    expect(bulk).not.toContain("upsertTermGrade(");
  });
});
