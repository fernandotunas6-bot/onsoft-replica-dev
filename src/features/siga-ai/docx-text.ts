/**
 * Extracção de texto de .docx, sem dependências novas.
 *
 * Um .docx é um ZIP cujo `word/document.xml` tem o texto em `<w:t>`. Lê-se o
 * directório central do ZIP (não os cabeçalhos locais, cujo tamanho pode vir a
 * zero com *data descriptor*), descomprime-se a entrada com o
 * `DecompressionStream("deflate-raw")` do próprio browser, e converte-se o XML
 * em texto com os limites de parágrafo preservados.
 *
 * Porque não uma biblioteca: as que fazem isto trazem um analisador de ZIP e um
 * `inflate` em JavaScript que o browser já tem. O formato que nos interessa é
 * uma fatia pequena e estável do OOXML, e esta é testável sem rede.
 *
 * O que **não** faz, de propósito: tabelas complexas, cabeçalhos e rodapés,
 * notas de fim, comentários e caixas de texto. Para a base de conhecimento
 * interessa o corpo do documento.
 */

export class DocxParseError extends Error {}

const textDecoder = new TextDecoder("utf-8");

/** Entrada do directório central que nos interessa. */
type ZipEntry = { name: string; compression: number; offset: number; compressedSize: number };

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}
function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

/**
 * Localiza o fim do directório central (assinatura `PK\x05\x06`) a partir do
 * fim do ficheiro: o comentário final pode ter até 64 KiB, por isso procura-se
 * de trás para a frente em vez de assumir que está no último byte.
 */
function findCentralDirectory(view: DataView): { count: number; offset: number } {
  const maxScan = Math.min(view.byteLength, 65_557);
  for (
    let index = view.byteLength - 22;
    index >= view.byteLength - maxScan && index >= 0;
    index -= 1
  ) {
    if (readUint32(view, index) === 0x06054b50) {
      return { count: readUint16(view, index + 10), offset: readUint32(view, index + 16) };
    }
  }
  throw new DocxParseError("Ficheiro .docx inválido: não parece um ZIP.");
}

function listEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { count, offset } = findCentralDirectory(view);
  const entries: ZipEntry[] = [];
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.byteLength || readUint32(view, cursor) !== 0x02014b50) break;
    const compression = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localOffset = readUint32(view, cursor + 42);
    const name = textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, compression, offset: localOffset, compressedSize });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Dados da entrada, saltando o cabeçalho local (cujo tamanho varia). */
function entryData(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readUint32(view, entry.offset) !== 0x04034b50) {
    throw new DocxParseError("Ficheiro .docx corrompido: entrada ZIP inesperada.");
  }
  const nameLength = readUint16(view, entry.offset + 26);
  const extraLength = readUint16(view, entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  return bytes.subarray(start, start + entry.compressedSize);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * XML do corpo → texto. `</w:p>` e `<w:br/>` tornam-se quebras de linha, para
 * que a fragmentação por parágrafo (ver `chunking.ts`) continue a ter onde
 * cortar; as entidades XML são resolvidas.
 */
export function documentXmlToText(xml: string): string {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n\n");
  // `<w:t>` pode ter atributos (xml:space="preserve"); o resto das etiquetas sai.
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Texto do corpo de um .docx. Lança `DocxParseError` com motivo legível. */
export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const entries = listEntries(bytes);
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) {
    throw new DocxParseError("Este .docx não tem corpo de documento legível (word/document.xml).");
  }
  const raw = entryData(bytes, document);
  let xmlBytes: Uint8Array;
  if (document.compression === 0) {
    xmlBytes = raw;
  } else if (document.compression === 8) {
    xmlBytes = await inflateRaw(raw);
  } else {
    throw new DocxParseError("Compressão do .docx não suportada. Guarde-o de novo no Word.");
  }
  const text = documentXmlToText(textDecoder.decode(xmlBytes));
  if (!text) throw new DocxParseError("O documento não tem texto para indexar.");
  return text;
}
