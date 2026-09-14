import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeLogFields,
  sanitizeAlertFields,
  isAlertableEvent,
  logSigaEvent,
  reportSigaError,
} from "@/lib/ops-report";

/**
 * O que está aqui a ser fixado não é o formato do log — é a garantia de que
 * dados de alunos não saem por esta via. Num sistema escolar, um relatório de
 * erro com o nome e o telefone de um menor é um incidente, não um diagnóstico.
 */

describe("sanitizeLogFields", () => {
  it("deixa passar o contexto necessário para diagnosticar", () => {
    const clean = sanitizeLogFields({
      school_id: "esc-1",
      user_id: "usr-1",
      module: "academic",
      action: "score.write",
      count: 3,
      idempotent: true,
    });
    expect(clean).toEqual({
      school_id: "esc-1",
      user_id: "usr-1",
      module: "academic",
      action: "score.write",
      count: 3,
      idempotent: true,
    });
  });

  it("descarta campos fora da lista, mesmo com aspecto inofensivo", () => {
    const clean = sanitizeLogFields({
      school_id: "esc-1",
      student_name: "Ana Silva",
      guardian_phone: "+244912345678",
      email: "ana@escola.ao",
      score: 14.5,
      address: "Rua X",
    });
    expect(clean).toEqual({ school_id: "esc-1" });
  });

  it("descarta objectos e arrays, que poderiam esconder dados pessoais", () => {
    const clean = sanitizeLogFields({
      school_id: "esc-1",
      error: { message: "falhou", student: { name: "Ana" } },
      count: [1, 2, 3],
    });
    expect(clean).toEqual({ school_id: "esc-1" });
  });

  it("aceita null como valor explícito", () => {
    expect(sanitizeLogFields({ reason: null })).toEqual({ reason: null });
  });

  it("deixa passar o passo de um fluxo com vários passos", () => {
    // `stage` entrou na lista para o provisionamento: quando a criação de uma
    // escola falha, tudo é revertido e não fica registo nenhum na base — saber
    // que parou em "domain" e não em "bootstrap" é a diferença entre
    // diagnosticar e adivinhar.
    expect(sanitizeLogFields({ stage: "domain", tenant_id: "ten-1" })).toEqual({
      stage: "domain",
      tenant_id: "ten-1",
    });
  });
});

describe("sanitizeAlertFields", () => {
  it("é mais restritiva do que a do log: não deixa sair a descrição do erro", () => {
    const fields = {
      school_id: "esc-1",
      code: "constraint_violation",
      error: "duplicate key: aluno Ana Silva já tem nota neste item",
    };
    expect(sanitizeLogFields(fields)).toHaveProperty("error");
    expect(sanitizeAlertFields(fields)).toEqual({
      school_id: "esc-1",
      code: "constraint_violation",
    });
  });

  it("deixa sair o passo, que é valor nosso e não texto de utilizador", () => {
    expect(sanitizeAlertFields({ stage: "verify", tenant_id: "ten-1" })).toEqual({
      stage: "verify",
      tenant_id: "ten-1",
    });
  });

  it("não deixa sair identificadores de pessoas", () => {
    const clean = sanitizeAlertFields({
      school_id: "esc-1",
      user_id: "usr-1",
      enrollment_id: "mat-1",
    });
    expect(clean).toEqual({ school_id: "esc-1" });
  });
});

describe("isAlertableEvent", () => {
  it("reconhece eventos críticos nomeados", () => {
    expect(isAlertableEvent("finance.settlement.failed")).toBe(true);
    expect(isAlertableEvent("assessment.score.write_failed")).toBe(true);
  });

  it("reconhece qualquer evento terminado em .failed", () => {
    expect(isAlertableEvent("qualquer.coisa.failed")).toBe(true);
  });

  it("não alerta em eventos informativos", () => {
    expect(isAlertableEvent("finance.settlement.ok")).toBe(false);
    expect(isAlertableEvent("assessment.score.written")).toBe(false);
  });

  it("alerta em todos os modos de falha do provisionamento", () => {
    // Os três merecem acordar alguém, por razões diferentes: a escola não
    // nasceu, a reversão deixou lixo que ocupa o slug, ou a escola nasceu e o
    // administrador não tem caminho para entrar.
    expect(isAlertableEvent("tenant.provisioning.failed")).toBe(true);
    expect(isAlertableEvent("tenant.provisioning.rollback.failed")).toBe(true);
    expect(isAlertableEvent("tenant.provisioning.invite.failed")).toBe(true);
  });

  it("não alerta quando o provisionamento corre bem", () => {
    expect(isAlertableEvent("tenant.provisioning.completed")).toBe(false);
  });
});

describe("logSigaEvent", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it("emite uma linha JSON com app, evento e timestamp", () => {
    logSigaEvent("finance.settlement.ok", { school_id: "esc-1", invoice_id: "inv-1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line.app).toBe("siga");
    expect(line.event).toBe("finance.settlement.ok");
    expect(line.school_id).toBe("esc-1");
    expect(line.invoice_id).toBe("inv-1");
    expect(typeof line.ts).toBe("string");
  });

  it("não deixa um campo não permitido chegar à linha emitida", () => {
    logSigaEvent("finance.settlement.ok", { school_id: "esc-1", payer_name: "Ana Silva" });
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).not.toHaveProperty("payer_name");
    expect(JSON.stringify(line)).not.toContain("Ana Silva");
  });

  it("preserva a cadeia de causas ao registar um erro", () => {
    const cause = new Error("constraint violada");
    const error = new Error("falha ao gravar nota", { cause });
    reportSigaError("assessment.score.write_failed", error, { school_id: "esc-1" });
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line.error).toContain("falha ao gravar nota");
    expect(line.error).toContain("constraint violada");
    expect(line.school_id).toBe("esc-1");
  });
});
