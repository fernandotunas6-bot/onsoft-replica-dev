import { describe, expect, it } from "vitest";
import { boletimSummary, buildEnrolledStudentDossier } from "@/features/academic/assessment-views";
import {
  matchPrintTemplateKey,
  printTemplateKeyFromTitle,
} from "@/features/documents/print-catalog";
import { issuerRoleFor } from "@/features/documents/verification";

describe("boletim: resumo de todas as disciplinas", () => {
  it("a média é a das MFA, não a da primeira disciplina", () => {
    const summary = boletimSummary([
      { mfa: 16, status: "Aprovado" },
      { mfa: 8, status: "Reprovado" },
    ]);
    expect(summary.average).toBe(12);
    expect(summary.status).toBe("Pendente");
    expect(summary.approved).toBe(1);
  });

  it("«Transita» só com todas aprovadas; sem nota fica «Pendente»", () => {
    expect(boletimSummary([{ mfa: 14, status: "Aprovado" }]).status).toBe("Transita");
    expect(
      boletimSummary([
        { mfa: 14, status: "Aprovado" },
        { mfa: null, status: "Pendente" },
      ]).status,
    ).toBe("Pendente");
    expect(boletimSummary([]).average).toBeNull();
  });

  it("o dossier só leva as disciplinas que o aluno tem", () => {
    const grade = (subject_id: string) => ({
      enrollment_id: "e1",
      subject_id,
      term: 1,
      mac: 12,
      npp: 12,
      npt: 12,
    });
    const rows = buildEnrolledStudentDossier(
      [grade("mat"), { ...grade("fis"), enrollment_id: "e2" }],
      [
        { id: "mat", name: "Matemática" },
        { id: "fis", name: "Física" },
        { id: "qui", name: "Química" },
      ],
      "e1",
      10,
    );
    expect(rows.map((row) => row.subjectName)).toEqual(["Matemática"]);
  });
});

describe("modelo e título dos documentos", () => {
  it("o cartão de estudante é um documento de serviço", () => {
    expect(printTemplateKeyFromTitle("Cartão de estudante")).toBe("service-document");
    expect(matchPrintTemplateKey("Cartão de estudante")).toBe("service-document");
    expect(printTemplateKeyFromTitle("Qualquer coisa")).toBeNull();
  });

  it("quem emite tem de poder emitir o documento que o título diz", () => {
    const titleKey = printTemplateKeyFromTitle("Certificado de Habilitações")!;
    expect(titleKey).toBe("certificado-habilitacoes");
    // Um professor pode emitir boletins, mas não certificados.
    expect(issuerRoleFor(["Professor"], "boletim-escolar", false)).toBe("Professor");
    expect(issuerRoleFor(["Professor"], titleKey, false)).toBeNull();
    expect(
      issuerRoleFor(["Tesouraria"], printTemplateKeyFromTitle("Declaração de matrícula")!, false),
    ).toBeNull();
  });
});
