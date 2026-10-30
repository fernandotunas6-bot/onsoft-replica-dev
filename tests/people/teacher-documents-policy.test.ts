import { describe, it, expect } from "vitest";
import {
  parseTeacherDocumentPolicy,
  requiredTeacherDocuments,
  resolveTeacherDocumentLevelContext,
  teacherDocumentChecklist,
} from "@/features/people/teacher-documents-policy";

describe("requisitos de documentação de docentes", () => {
  it("fica desligado numa escola sem configuração e não bloqueia o cadastro", () => {
    const policy = parseTeacherDocumentPolicy(null);
    expect(policy.enabled).toBe(false);
    expect(requiredTeacherDocuments(policy, ["superior"])).toEqual([]);
  });

  it("respeita obrigatórios globais e adicionais por nível, sem vazar para outros níveis", () => {
    const policy = parseTeacherDocumentPolicy({
      enabled: true,
      required: ["bi", "habilitacoes"],
      requiredByLevel: {
        superior: ["pos_graduacao", "inaarees"],
        primario: ["formacao_pedagogica"],
      },
    });
    expect(requiredTeacherDocuments(policy, ["superior"])).toEqual([
      "bi",
      "habilitacoes",
      "inaarees",
      "pos_graduacao",
    ]);
    expect(requiredTeacherDocuments(policy, ["primario"])).toEqual([
      "bi",
      "habilitacoes",
      "formacao_pedagogica",
    ]);
    expect(requiredTeacherDocuments(policy, [])).toEqual(["bi", "habilitacoes"]);
  });

  it("limita códigos e níveis à lista autorizada do SIGA", () => {
    const policy = parseTeacherDocumentPolicy({
      enabled: true,
      required: ["bi", "outro_tenant"],
      requiredByLevel: { superior: ["docencia", "credit_card"], inexistente: ["contrato"] },
    });
    expect(policy.required).toEqual(["bi"]);
    expect(policy.requiredByLevel.superior).toEqual(["docencia"]);
    expect(Object.hasOwn(policy.requiredByLevel, "inexistente")).toBe(false);
  });

  it("diferencia entrega de confirmação de autenticidade e mantém opcionais", () => {
    const policy = parseTeacherDocumentPolicy({
      enabled: true,
      required: ["bi"],
      requiredByLevel: {},
    });
    const lines = teacherDocumentChecklist(policy, ["bi"], ["primario"]);
    expect(lines.find((row) => row.code === "bi")).toMatchObject({
      required: true,
      received: true,
      status: "recebido",
    });
    expect(lines.find((row) => row.code === "contrato")).toMatchObject({
      required: false,
      received: false,
      status: "em_falta",
    });
  });
  it("não marca todos os requisitos como completos numa escola mista sem atribuições", () => {
    const policy = parseTeacherDocumentPolicy({
      enabled: true,
      required: ["bi"],
      requiredByLevel: { superior: ["pos_graduacao"], primario: ["formacao_pedagogica"] },
    });
    expect(resolveTeacherDocumentLevelContext(policy, [], ["primario", "superior"])).toEqual({
      levels: [],
      levelPending: true,
    });
    expect(
      resolveTeacherDocumentLevelContext(policy, ["superior"], ["primario", "superior"]),
    ).toEqual({ levels: ["superior"], levelPending: false });
    expect(resolveTeacherDocumentLevelContext(policy, [], ["superior"])).toEqual({
      levels: ["superior"],
      levelPending: false,
    });
  });
});
