/**
 * Extracção de PDF sem dependências. Os PDFs dos testes são gerados com o
 * `jspdf` que o SIGA já usa para emitir documentos — ficheiros reais, sem
 * binários no repositório, e nos dois formatos que importam (fluxo de conteúdo
 * em claro e comprimido com Flate).
 */
import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import {
  assertReadable,
  contentStreamToText,
  extractPdfText,
  PdfParseError,
} from "@/features/siga-ai/pdf-text";

function makePdf(lines: string[], compress: boolean): ArrayBuffer {
  const doc = new jsPDF({ compress });
  lines.forEach((line, index) => doc.text(line, 10, 10 + index * 10));
  return doc.output("arraybuffer");
}

const LINES = [
  "Regulamento Interno da Escola",
  "Artigo 1 - A matricula e a propina",
  "Artigo 2 - O horario das aulas",
];

describe("siga-ai extraccao de PDF", () => {
  it("lê um PDF com fluxo em claro", async () => {
    const text = await extractPdfText(makePdf(LINES, false));
    for (const line of LINES) expect(text).toContain(line);
  });

  it("lê um PDF com fluxo comprimido (Flate)", async () => {
    const text = await extractPdfText(makePdf(LINES, true));
    expect(text).toContain("Regulamento Interno da Escola");
  });

  it("separa as linhas, para a fragmentação ter onde cortar", async () => {
    const text = await extractPdfText(makePdf(LINES, false));
    expect(text.split("\n").filter((line) => line.trim()).length).toBeGreaterThanOrEqual(3);
  });

  it("recusa um ficheiro que não é PDF", async () => {
    const bytes = new TextEncoder().encode("isto é texto, não um PDF".repeat(10));
    await expect(extractPdfText(bytes.buffer as ArrayBuffer)).rejects.toBeInstanceOf(PdfParseError);
  });

  it("recusa um PDF protegido por senha com instrução clara", async () => {
    const fake = new TextEncoder().encode("%PDF-1.7\n/Encrypt 5 0 R\ntrailer\n");
    await expect(extractPdfText(fake.buffer as ArrayBuffer)).rejects.toThrow(/senha/i);
  });

  it("recusa um PDF sem texto em vez de indexar nada", async () => {
    const empty = new jsPDF().output("arraybuffer");
    await expect(extractPdfText(empty)).rejects.toThrow(/reconhecimento óptico|extrair texto/i);
  });

  it("recusa texto ilegível em vez de o indexar", () => {
    // Um subconjunto de tipo de letra sem /ToUnicode sai assim: a IA citaria
    // um documento que ninguém escreveu deste modo.
    const garbage = "\u0001\u0002\u0003\u0004\u0005".repeat(20);
    expect(() => assertReadable(garbage)).toThrow(PdfParseError);
    expect(assertReadable("Texto perfeitamente legível de um regulamento.")).toContain("legível");
  });

  describe("operadores de texto", () => {
    it("lê Tj, TJ e as variantes com mudança de linha", () => {
      expect(contentStreamToText("BT (Olá) Tj ET")).toBe("Olá");
      expect(contentStreamToText("BT [(Pro)-500(pina)] TJ ET")).toBe("Pro pina");
      expect(contentStreamToText("BT (uma) ' (outra) ' ET")).toBe("uma\noutra");
    });

    it("resolve escapes, octais e strings hexadecimais", () => {
      expect(contentStreamToText("BT (a\\(b\\)c) Tj ET")).toBe("a(b)c");
      // \351 é "é" em Latin-1/WinAnsi.
      expect(contentStreamToText("BT (matr\\355cula) Tj ET")).toBe("matrícula");
      expect(contentStreamToText("BT <4F6C61> Tj ET")).toBe("Ola");
    });

    it("traduz a zona 0x80–0x9F pelo WinAnsi, não pelo Latin-1", () => {
      // \222 é a apóstrofe curva no WinAnsi; em Latin-1 seria um caractere de controlo.
      expect(contentStreamToText("BT (hoje\\222s) Tj ET")).toBe("hoje’s");
    });

    it("usa Td/T* como mudança de linha", () => {
      expect(contentStreamToText("BT (linha1) Tj 0 -14 Td (linha2) Tj ET")).toBe("linha1\nlinha2");
    });
  });
});
