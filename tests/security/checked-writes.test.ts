import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Escritas cujo resultado era descartado (`await db.from(...).update(...)` sem
// ler `error`). O Supabase não lança: devolve o erro. Sem o ler, a operação
// "corria bem" no ecrã e o dado ficava errado sem rasto (2026-09-29).

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("acessos", () => {
  const source = read("src/features/access/server.ts");

  it("mudar o cargo: primeiro o papel novo, depois retirar os outros, com erros vistos", () => {
    expect(source).not.toMatch(
      /await admin\.from\("member_roles"\)\.delete\(\)\.eq\("membership_id", membership\.id\);\s*await admin\.from\("member_roles"\)\.insert/,
    );
    const add = source.indexOf("error: addRoleError");
    const drop = source.indexOf("error: dropRolesError");
    expect(add).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(add);
  });

  it("aceitar convite não levanta uma suspensão", () => {
    expect(source).toMatch(/existingMembership\.status === "suspended"/);
    expect(source).not.toMatch(/\/\/ Reactivar se estava suspensa/);
  });
});

describe("presenças", () => {
  const source = read("src/features/pedagogica/attendance-server.ts");

  it("fechar a chamada e decidir justificações verificam o erro", () => {
    expect(source).toMatch(/error: completeError/);
    expect(source).toMatch(/error: reviewError/);
    expect(source).toMatch(/error: excuseError/);
  });
});

describe("pagamentos: estados depois do registo ficam nos registos", () => {
  it("folha de salários", () => {
    const source = read("src/features/hr/payments.ts");
    expect(source).toMatch(/async function syncPaymentStatus/);
    expect(source).not.toMatch(
      /\n\s+await db\s*\n\s+\.from\("hr_payroll_(runs|items|payment_batches)"\)/,
    );
  });

  it("AppyPay: reconciliação e criação da cobrança", () => {
    const reconcile = read("src/features/finance/appypay-reconcile.server.ts");
    expect(reconcile).not.toMatch(/\n\s+await db\s*\n\s+\.from\("payment_gateway_charges"\)/);
    expect(reconcile).toMatch(/error: claimError/);
    const create = read("src/features/finance/appypay.functions.ts");
    expect(create).toMatch(/error: linkError/);
  });

  it("planos de pagamento liquidados", () => {
    const source = read("src/features/finance/server.ts");
    expect(source).toMatch(/finance\.payment_plan\.settle_failed/);
  });
});

describe("alunos", () => {
  it("trocar o encarregado principal verifica o erro", () => {
    expect(read("src/features/students/server.ts")).toMatch(/error: primaryError/);
  });

  it("matricular numa turma confirma o aluno activo", () => {
    expect(read("src/features/students/server.ts")).toMatch(/error: activateError/);
  });
});

describe("ano lectivo: um activo de cada vez", () => {
  it("guardar as definições da escola nunca activa nem fecha anos lectivos", () => {
    const source = read("src/features/school/server.ts");
    const update = source.slice(
      source.indexOf("export const updateSchoolSettings"),
      source.indexOf("export const listRecentAuditLogs"),
    );
    expect(update).not.toContain('.from("academic_years")');
  });

  it("calendário lectivo verifica o fecho do ano anterior", () => {
    expect(read("src/features/calendar/server.ts")).toMatch(/error: closeError/);
  });
});

describe("importação", () => {
  const source = read("src/features/import/server.ts");

  it("uma linha gravada e não marcada pára o lote (não se importa duas vezes)", () => {
    expect(source).toMatch(/let markError = /);
    expect(source).toMatch(/A importação parou para não a repetir/);
  });

  it("o registo para reverter é verificado", () => {
    expect(source).toMatch(/error: auditError/);
  });
});

describe("webhook de pagamento", () => {
  it("fatura que não muda de estado depois do recibo fica registada", () => {
    expect(read("src/features/finance/gateway-webhook-handler.ts")).toMatch(
      /finance\.gateway\.invoice_status_failed/,
    );
  });
});

describe("planos de aula: avaliações a mais", () => {
  const source = read("src/features/lesson-plans/server.ts");

  it("não apaga avaliações com notas se não conseguir ler as notas", () => {
    expect(source).toMatch(/error: scoresError/);
    expect(source.indexOf("error: scoresError")).toBeLessThan(source.indexOf("error: removeError"));
  });

  it("não duplica avaliações se não conseguir contar as existentes", () => {
    expect(source).toMatch(/error: itemsError/);
  });
});

describe("QR do professor e BI da ficha", () => {
  it("o QR anterior é anulado antes do novo, com erro visto", () => {
    expect(read("src/features/hr/teacher-lessons.ts")).toMatch(/error: revokeError/);
  });

  it("o BI que não passa para a ficha é dito", () => {
    expect(read("src/features/people/server.ts")).toMatch(/error: biError/);
  });
});
