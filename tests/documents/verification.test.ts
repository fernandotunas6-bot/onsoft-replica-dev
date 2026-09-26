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

  it("a página de verificação é pública", () => {
    expect(isPublicAppPath("/verificar")).toBe(true);
  });
});
