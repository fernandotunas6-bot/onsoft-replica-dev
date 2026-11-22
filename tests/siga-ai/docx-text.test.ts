/**
 * Extracção de .docx sem dependências: o ZIP é construído aqui com o `zlib` do
 * Node, para o teste exercitar o caminho real (directório central → inflate →
 * XML → texto) sem um binário no repositório.
 */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DocxParseError, documentXmlToText, extractDocxText } from "@/features/siga-ai/docx-text";

/** ZIP mínimo com uma entrada, comprimida (método 8) ou não (método 0). */
function buildZip(name: string, content: Uint8Array, compress: boolean): ArrayBuffer {
  const nameBytes = new TextEncoder().encode(name);
  const data = compress ? new Uint8Array(deflateRawSync(content)) : content;
  const method = compress ? 8 : 0;
  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(8, method, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, content.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(10, method, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, content.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out.buffer;
}

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t xml:space="preserve">Regulamento Interno </w:t></w:r><w:r><w:t>da Escola</w:t></w:r></w:p>
<w:p><w:r><w:t>Artigo 1.&#186; &#8212; A matr&#237;cula &amp; a propina</w:t></w:r></w:p>
<w:p><w:r><w:t>Primeira linha</w:t><w:br/><w:t>Segunda linha</w:t></w:r></w:p>
</w:body></w:document>`;

const docx = (compress = true) =>
  buildZip("word/document.xml", new TextEncoder().encode(DOCUMENT_XML), compress);

describe("siga-ai extracção de .docx", () => {
  it("lê o texto de um .docx comprimido", async () => {
    const text = await extractDocxText(docx());
    expect(text).toContain("Regulamento Interno da Escola");
    expect(text).toContain("Artigo 1.º — A matrícula & a propina");
  });

  it("lê também uma entrada guardada sem compressão", async () => {
    expect(await extractDocxText(docx(false))).toContain("Regulamento Interno");
  });

  it("mantém os parágrafos separados, para a fragmentação ter onde cortar", async () => {
    const text = await extractDocxText(docx());
    expect(text.split("\n\n").length).toBeGreaterThanOrEqual(3);
    expect(text).toContain("Primeira linha\nSegunda linha");
  });

  it("recusa com motivo legível um ficheiro que não é ZIP", async () => {
    const notZip = new TextEncoder().encode("isto não é um docx, é texto".repeat(5));
    await expect(extractDocxText(notZip.buffer as ArrayBuffer)).rejects.toBeInstanceOf(
      DocxParseError,
    );
  });

  it("recusa um ZIP sem corpo de documento", async () => {
    const other = buildZip("word/footer1.xml", new TextEncoder().encode("<x/>"), true);
    await expect(extractDocxText(other)).rejects.toThrow(/word\/document\.xml/);
  });

  it("não deixa escapar etiquetas XML para o texto indexado", () => {
    expect(documentXmlToText("<w:p><w:r><w:t>Só texto</w:t></w:r></w:p>")).toBe("Só texto");
    expect(documentXmlToText("<w:p><w:r><w:t>a&lt;b</w:t></w:r></w:p>")).toBe("a<b");
  });
});
