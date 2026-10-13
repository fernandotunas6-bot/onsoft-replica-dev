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

function makePdf(lines: string[]): ArrayBuffer {
  const doc = new jsPDF();
  lines.forEach((line, index) => doc.text(line, 10, 10 + index * 10));
  return doc.output("arraybuffer");
}

/**
 * PDF de um fluxo comprimido, montado com o `CompressionStream` do próprio
 * runtime.
 *
 * Duas voltas foram precisas para chegar aqui, e a razão interessa. Com
 * `new jsPDF({ compress: true })` o teste dependia do deflate do jsPDF; com o
 * `zlib` do Node, dependia de o `zlib` e o `DecompressionStream` concordarem.
 * Nas duas versões passou localmente (bun 1.4.2 e 1.4.3) e falhou no CI, ou
 * seja, media a cadeia de ferramentas em vez do extractor. Comprimindo com a
 * mesma família de API que usamos para descomprimir, o ciclo fecha-se em si
 * mesmo: se o runtime comprime, tem de conseguir descomprimir, e o que resta
 * em teste é o nosso código.
 */
async function deflate(content: string): Promise<Uint8Array> {
  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  const bytes = new Uint8Array(content.length);
  for (let index = 0; index < content.length; index += 1) {
    bytes[index] = content.charCodeAt(index) & 0xff;
  }
  const written = writer
    .write(bytes as unknown as BufferSource)
    .then(() => writer.close())
    .catch(() => {});
  const out = new Uint8Array(await new Response(compressor.readable).arrayBuffer());
  await written;
  return out;
}

async function makeCompressedPdf(content: string): Promise<ArrayBuffer> {
  const deflated = await deflate(content);
  const head = `%PDF-1.4\n1 0 obj\n<<\n/Length ${deflated.length}\n/Filter /FlateDecode\n>>\nstream\n`;
  const tail = "\nendstream\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF\n";
  const bytes = new Uint8Array(head.length + deflated.length + tail.length);
  for (let index = 0; index < head.length; index += 1) bytes[index] = head.charCodeAt(index);
  bytes.set(deflated, head.length);
  for (let index = 0; index < tail.length; index += 1) {
    bytes[head.length + deflated.length + index] = tail.charCodeAt(index);
  }
  return bytes.buffer;
}

const LINES = [
  "Regulamento Interno da Escola",
  "Artigo 1 - A matricula e a propina",
  "Artigo 2 - O horario das aulas",
];

describe("siga-ai extraccao de PDF", () => {
  it("lê um PDF com fluxo em claro", async () => {
    const text = await extractPdfText(makePdf(LINES));
    for (const line of LINES) expect(text).toContain(line);
  });

  it("lê um PDF com fluxo comprimido (Flate)", async () => {
    const content = LINES.map((line) => `BT (${line}) Tj ET`).join("\n");
    const text = await extractPdfText(await makeCompressedPdf(content));
    for (const line of LINES) expect(text).toContain(line);
  });

  it("diz que não conseguiu descomprimir, em vez de culpar o documento", async () => {
    // Fluxo anunciado como Flate mas com dados que não abrem: o utilizador tem
    // de saber que o ficheiro está danificado, não que «é digitalizado».
    const broken = await makeCompressedPdf("BT (x) Tj ET");
    const bytes = new Uint8Array(broken);
    const streamStart = String.fromCharCode(...bytes).indexOf("stream\n") + 7;
    bytes[streamStart + 2] = 0x00;
    bytes[streamStart + 3] = 0x00;
    await expect(extractPdfText(bytes.buffer as ArrayBuffer)).rejects.toThrow(/descomprimir/i);
  });

  it("separa as linhas, para a fragmentação ter onde cortar", async () => {
    const text = await extractPdfText(makePdf(LINES));
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
