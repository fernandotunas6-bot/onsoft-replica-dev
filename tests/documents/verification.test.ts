import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateVerificationCode,
  isVerificationCode,
  maskHolderName,
  normalizeVerificationCode,
} from "@/features/documents/verification";
import { isPublicAppPath } from "@/lib/public-paths";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("verificação de documentos oficiais", () => {
  it("gera códigos aleatórios no formato SIGA-XXXX-XXXX, sem caracteres ambíguos", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVerificationCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(isVerificationCode(code), code).toBe(true);
      expect(code.slice(5)).not.toMatch(/[01IO]/);
    }
  });

  it("aceita o código escrito à mão com minúsculas e espaços", () => {
    expect(normalizeVerificationCode(" siga-abcd-2345 ")).toBe("SIGA-ABCD-2345");
    expect(isVerificationCode("siga-abcd-2345")).toBe(true);
    // O código antigo, calculado no browser, não é aceite como verificável.
    expect(isVerificationCode("SIGA-1A2B3C4D")).toBe(false);
  });

  it("mostra só as iniciais do titular a quem tem o código", () => {
    expect(maskHolderName("Ana Domingos Ferreira")).toBe("A. D. F.");
    expect(maskHolderName("")).toBe("—");
  });

  it("a emissão oficial regista o documento e imprime código e QR verdadeiros", () => {
    const issue = read("src/features/documents/print-issue.ts");
    expect(issue).toMatch(/registerIssuedDocument\(/);
    expect(issue).toMatch(/hash: verification\.code/);
    expect(issue).toMatch(/qrCodeDataUrl: verification\.qrCodeDataUrl/);
  });

  it("o certificado só promete verificação quando há registo", () => {
    const cert = read("public/templates/certificado-habilitacoes.hbs");
    expect(cert).not.toMatch(/A validade pode ser confirmada pelo QR Code ou pelo hash acima/);
    expect(cert).toMatch(/\{\{#if document\.verifyUrl\}\}/);
  });

  it("recibos registam número e valor, e a verificação mostra-os", () => {
    const issue = read("src/features/documents/print-issue.ts");
    expect(issue).toMatch(/reference: input\.student\?\.documentTitle/);
    expect(issue).toMatch(/amountLabel: input\.amountLabel/);
    expect(read("src/routes/faturas.tsx")).toMatch(/amountLabel: kwanza\(/);
    expect(read("src/routes/verificar.tsx")).toMatch(/query\.data\.amount/);
  });

  it("o PDF de alternativa não desenha um QR falso nem promete validação", () => {
    const pdf = read("src/lib/export-pdf.ts");
    expect(pdf).not.toMatch(/Validar: /);
    expect(pdf).not.toMatch(/charCodeAt\(\(row \+ col\)/);
  });

  it("a página de verificação é pública", () => {
    expect(isPublicAppPath("/verificar")).toBe(true);
  });
});

describe("quem emite cada documento verificável", () => {
  it("professor emite documentos pedagógicos, não certificados nem declarações", async () => {
    const { issuerRoleFor } = await import("@/features/documents/verification");
    expect(issuerRoleFor(["Professor"], "pauta-disciplinar", false)).toBe("Professor");
    expect(issuerRoleFor(["Professor"], "boletim-escolar", false)).toBe("Professor");
    expect(issuerRoleFor(["Professor"], "certificado-habilitacoes", false)).toBeNull();
    expect(issuerRoleFor(["Professor"], "declaracao-notas-simples", false)).toBeNull();
    expect(issuerRoleFor(["Professor"], "historico-academico-individual", false)).toBeNull();
  });

  it("documento com valor só da Direcção, Secretaria ou Tesouraria", async () => {
    const { issuerRoleFor } = await import("@/features/documents/verification");
    expect(issuerRoleFor(["Professor"], "pauta-disciplinar", true)).toBeNull();
    expect(issuerRoleFor(["Secretaria"], "service-document", true)).toBe("Secretaria");
    expect(issuerRoleFor(["Tesouraria"], "service-document", true)).toBe("Tesouraria");
    expect(issuerRoleFor(["Tesouraria"], "certificado-habilitacoes", false)).toBeNull();
  });

  it("mostra o papel mais alto que permite emitir", async () => {
    const { issuerRoleFor } = await import("@/features/documents/verification");
    expect(issuerRoleFor(["Professor", "Secretaria"], "boletim-escolar", false)).toBe("Secretaria");
  });

  it("o registo exige um modelo conhecido e verifica o papel antes de escrever", () => {
    const source = readFileSync("src/features/documents/verification.ts", "utf8");
    expect(source).toContain('refine(isPrintTemplateKey, "Modelo de documento não reconhecido.")');
    const register = source.slice(source.indexOf("export const registerIssuedDocument"));
    expect(register.indexOf("issuerRoleFor(")).toBeLessThan(register.indexOf('from("audit_logs")'));
  });
});

describe("disciplinas com o nome à data da emissão", () => {
  it("lê as disciplinas impressas nas formas que os modelos usam, sem notas nem repetições", async () => {
    const { printedSubjectNames } = await import("@/features/documents/printed-subjects");
    expect(
      printedSubjectNames({
        grades: [
          { subject: "Matemática", mac: 14, finalGrade: 15 },
          { subject: " Língua   Portuguesa ", finalGrade: 12 },
          { subject: "Matemática" },
          { subject: 3 },
        ],
        subjects: [{ name: "Física" }, { other: "x" }],
        subject: { name: "Química" },
      }),
    ).toEqual(["Matemática", "Língua Portuguesa", "Física", "Química"]);
    expect(printedSubjectNames({})).toEqual([]);
    expect(printedSubjectNames({ grades: "x", subjects: null, subject: [] })).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => ({ subject: `D${i}` }));
    expect(printedSubjectNames({ grades: many })).toHaveLength(40);
  });

  it("a emissão guarda os nomes impressos e a verificação mostra-os", () => {
    const issue = read("src/features/documents/print-issue.ts");
    expect(issue).toMatch(/subjects: printedSubjectNames\(payload\)/);
    const verification = read("src/features/documents/verification.ts");
    expect(verification).toMatch(/subjects: data\.subjects\?\.length \? data\.subjects : null/);
    expect(read("src/routes/verificar.tsx")).toMatch(/query\.data\.subjects\.join/);
  });
});
