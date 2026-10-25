import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O rodapé de validação dos recibos e faturas imprimia o mesmo código como «UUID»
 * e como «Hash», uma «Assinatura digital» e um «QR para validação pública» que
 * nada preenchia — linhas vazias que, num documento com valor, pareciam a
 * assinatura fiscal das faturas certificadas pela AGT.
 */
const dir = join(process.cwd(), "public/templates");
const modelos = readdirSync(dir).filter((f) => f.endsWith(".hbs"));

describe("rodapé de validação dos documentos", () => {
  it.each(modelos)("%s só usa campos que print-issue preenche", (ficheiro) => {
    const fonte = readFileSync(join(dir, ficheiro), "utf8");
    expect(fonte).not.toMatch(/document\.(signatureAlgorithm|digitalSignature|qrCodeUrl)/);
  });

  it("recibos e faturas dizem que o QR é para verificar e que não são documento AGT", () => {
    const fonte = readFileSync(join(dir, "service-document.hbs"), "utf8");
    expect(fonte).toMatch(/não para pagar/);
    expect(fonte).toMatch(
      /\{\{#if document\.financial\}\}[^{]*não é fatura nem recibo fiscal certificado pela AGT/,
    );
    const issue = readFileSync(
      join(process.cwd(), "src/features/documents/print-issue.ts"),
      "utf8",
    );
    expect(issue).toMatch(/financial: Boolean\(input\.amountLabel\)/);
  });
});
