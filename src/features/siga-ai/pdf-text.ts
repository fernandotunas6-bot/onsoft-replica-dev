/**
 * Extracção de texto de PDF, sem dependências novas.
 *
 * Porque não `pdfjs`: trazia cerca de um megabyte ao pacote do browser para
 * fazer, num PDF de texto, o que são duas coisas — descomprimir os fluxos de
 * conteúdo (o `DecompressionStream` do browser já o faz) e ler os operadores de
 * texto do PostScript simplificado que está lá dentro. O que o `pdfjs` traz a
 * mais é renderização e tipografia completas, que aqui não servem para nada.
 *
 * **Os limites são reais e estão impostos em código, não só documentados:**
 *  - PDF digitalizado (imagem) não tem texto nenhum — não há OCR;
 *  - tipos de letra embutidos em subconjunto, sem `/ToUnicode`, dão texto
 *    ilegível em vez de erro.
 *
 * Nos dois casos `assertReadable` recusa com uma mensagem que diz o que fazer,
 * em vez de indexar lixo na base de conhecimento — que seria pior do que não
 * indexar nada: a IA citaria um documento que ninguém escreveu assim.
 */

export class PdfParseError extends Error {}

/** Bytes → texto preservando cada byte (a estrutura do PDF é byte a byte). */
const latin1 = new TextDecoder("iso-8859-1");

/**
 * WinAnsi difere de Latin-1 em 0x80–0x9F, e é lá que vivem as aspas curvas, os
 * travessões e o €, comuníssimos em documentos escolares.
 */
const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

function decodePdfByte(code: number): string {
  return WIN_ANSI_HIGH[code] ?? String.fromCharCode(code);
}

/** Uma string literal `(...)` do PDF, já com escapes e octais resolvidos. */
function decodeLiteral(raw: string): string {
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (char !== "\\") {
      out += decodePdfByte(char.charCodeAt(0));
      continue;
    }
    const next = raw[index + 1];
    index += 1;
    if (next === undefined) break;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "\n")
      continue; // continuação de linha
    else if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3) {
        const digit = raw[index + 1];
        if (!digit || digit < "0" || digit > "7") break;
        octal += digit;
        index += 1;
      }
      out += decodePdfByte(Number.parseInt(octal, 8));
    } else out += next;
  }
  return out;
}

/** Uma string hexadecimal `<...>`. */
function decodeHex(raw: string): string {
  const clean = raw.replace(/[^0-9a-fA-F]/g, "");
  const padded = clean.length % 2 ? `${clean}0` : clean;
  let out = "";
  for (let index = 0; index < padded.length; index += 2) {
    out += decodePdfByte(Number.parseInt(padded.slice(index, index + 2), 16));
  }
  return out;
}

/**
 * Fluxo de conteúdo → texto.
 *
 * Lê `Tj`, `TJ`, `'` e `"`, e usa `Td`/`TD`/`T*` e `ET` para saber onde há
 * mudança de linha e de bloco — sem isso, um regulamento inteiro chegava numa
 * só linha e a fragmentação (ver `chunking.ts`) não tinha onde cortar.
 */
export function contentStreamToText(content: string): string {
  let out = "";
  let pendingBreak = "";
  const push = (text: string) => {
    if (!text) return;
    if (pendingBreak && out) out += pendingBreak;
    pendingBreak = "";
    out += text;
  };

  // `(…)`, `<…>`, `[…]`, operadores e números — por esta ordem.
  const token = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\[(?:[^\][]|\\.)*\]|T[jJdDLm*]|ET|BT|'|"/gs;
  let match: RegExpExecArray | null;
  let lastArray: string | null = null;
  let lastString: string | null = null;

  while ((match = token.exec(content))) {
    const piece = match[0]!;
    if (piece.startsWith("(")) {
      lastString = decodeLiteral(piece.slice(1, -1));
      lastArray = null;
    } else if (piece.startsWith("<") && !piece.startsWith("<<")) {
      lastString = decodeHex(piece.slice(1, -1));
      lastArray = null;
    } else if (piece.startsWith("[")) {
      lastArray = piece;
      lastString = null;
    } else if (piece === "Tj" || piece === "'" || piece === '"') {
      if (piece !== "Tj") pendingBreak = "\n";
      push(lastString ?? "");
      lastString = null;
    } else if (piece === "TJ") {
      if (lastArray) {
        let text = "";
        const inner = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|-?\d+(?:\.\d+)?/gs;
        let element: RegExpExecArray | null;
        while ((element = inner.exec(lastArray))) {
          const value = element[0]!;
          if (value.startsWith("(")) text += decodeLiteral(value.slice(1, -1));
          else if (value.startsWith("<")) text += decodeHex(value.slice(1, -1));
          // Avanço negativo grande é espaço entre palavras; o limiar é o que o
          // próprio formato usa para separar sem um caractere de espaço.
          else if (Number.parseFloat(value) < -120) text += " ";
        }
        push(text);
        lastArray = null;
      }
    } else if (piece === "Td" || piece === "TD" || piece === "T*") {
      pendingBreak ||= "\n";
      lastArray = null;
      lastString = null;
    } else if (piece === "ET") {
      pendingBreak = "\n";
    }
  }

  return out;
}

/** Posição de cada fluxo do ficheiro, com o dicionário que o precede. */
function* streamBlocks(raw: string): Generator<{ dict: string; body: string }> {
  const marker = /stream\r?\n?/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    // `endstream` também contém «stream»: sem isto, cada fluxo era lido duas
    // vezes e a segunda com limites negativos.
    if (raw.slice(Math.max(0, match.index - 3), match.index) === "end") {
      marker.lastIndex = match.index + 6;
      continue;
    }
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;

    // O dicionário é o `<< … >>` imediatamente antes de `stream`.
    const dictEnd = raw.lastIndexOf(">>", match.index);
    const dictStart = dictEnd >= 0 ? raw.lastIndexOf("<<", dictEnd) : -1;
    const dict = dictStart >= 0 ? raw.slice(dictStart, dictEnd + 2) : "";

    // `/Length` manda sobre a procura de `endstream`: entre os dados e o
    // marcador há uma mudança de linha que o `inflate` lê como lixo no fim do
    // fluxo e recusa. Quando o valor é uma referência indirecta («/Length 8 0
    // R») não há número aqui, e aí vale o `endstream` com o fim limpo.
    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const length = declared ? Number(declared[1]) : null;
    const body =
      length !== null && start + length <= end
        ? raw.slice(start, start + length)
        : raw.slice(start, end).replace(/\r?\n$/, "");

    yield { dict, body };
    marker.lastIndex = end + 9;
  }
}

async function inflateWith(
  data: Uint8Array,
  format: "deflate" | "deflate-raw",
): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Descomprime um fluxo `/FlateDecode`.
 *
 * O PDF não diz se os dados trazem o invólucro zlib ou são deflate cru, e há
 * ficheiros com cada um. O primeiro byte 0x78 é a assinatura do zlib, e serve
 * para tentar primeiro o formato certo; se falhar, tenta-se o outro, porque
 * ficheiros mal gerados existem e a tolerância do `inflate` varia com o
 * runtime.
 */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const zlibFirst = data[0] === 0x78;
  const order: Array<"deflate" | "deflate-raw"> = zlibFirst
    ? ["deflate", "deflate-raw"]
    : ["deflate-raw", "deflate"];
  let lastError: unknown;
  for (const format of order) {
    try {
      return await inflateWith(data, format);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("inflate falhou");
}

function toBytes(body: string): Uint8Array {
  const bytes = new Uint8Array(body.length);
  for (let index = 0; index < body.length; index += 1) bytes[index] = body.charCodeAt(index) & 0xff;
  return bytes;
}

/**
 * Recusa texto que não serve para indexar: PDF digitalizado (não dá texto
 * nenhum) ou tipo de letra em subconjunto sem `/ToUnicode` (dá caracteres
 * trocados). Indexar isto seria pior do que não indexar: a IA citaria um
 * documento que ninguém escreveu assim.
 */
export function assertReadable(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 20) {
    throw new PdfParseError(
      "Não foi possível extrair texto deste PDF. Se for digitalizado (imagem), " +
        "o SIGA AI não faz reconhecimento óptico: use a versão em Word ou cole o texto num .txt.",
    );
  }
  const readable = (clean.match(/[\p{L}\p{N}\p{P}\p{Zs}]/gu) ?? []).length / clean.length;
  if (readable < 0.8) {
    throw new PdfParseError(
      "O texto deste PDF saiu ilegível — costuma acontecer com tipos de letra embutidos " +
        "em subconjunto. Guarde-o como Word (.docx) ou texto simples e volte a tentar.",
    );
  }
  return clean.length === text.trim().length ? text.trim() : text.trim();
}

/** Texto de um PDF de texto. Lança `PdfParseError` com motivo legível. */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const raw = latin1.decode(new Uint8Array(buffer));
  if (!raw.startsWith("%PDF-")) {
    throw new PdfParseError("Ficheiro inválido: não parece um PDF.");
  }
  if (/\/Encrypt\b/.test(raw)) {
    throw new PdfParseError(
      "Este PDF está protegido por senha. Remova a protecção e tente de novo.",
    );
  }

  const pieces: string[] = [];
  // Contados para distinguir «este PDF não tem texto» de «não consegui abrir os
  // fluxos deste PDF»: antes, um `continue` silencioso em cada fluxo acabava na
  // mensagem errada — dizia ao utilizador que o documento era digitalizado.
  let flateStreams = 0;
  let flateFailures = 0;
  for (const { dict, body } of streamBlocks(raw)) {
    // Fluxos que não são conteúdo de página (imagens, tipos de letra, metadados)
    // não têm operadores de texto; são ignorados pelo extractor sem custo.
    let content: string;
    if (/\/FlateDecode/.test(dict)) {
      flateStreams += 1;
      try {
        content = latin1.decode(await inflate(toBytes(body)));
      } catch {
        flateFailures += 1;
        continue; // fluxo que não abre: segue para o próximo
      }
    } else if (/\/(?:DCT|JPX|CCITTFax|JBIG2|LZW|RunLength)Decode/.test(dict)) {
      continue;
    } else {
      content = body;
    }
    const text = contentStreamToText(content);
    if (text.trim()) pieces.push(text);
  }

  const joined = pieces
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!joined && flateStreams > 0 && flateFailures === flateStreams) {
    throw new PdfParseError(
      "Não foi possível descomprimir o conteúdo deste PDF — o ficheiro pode estar " +
        "danificado. Guarde-o de novo a partir da aplicação de origem, ou use a versão " +
        "em Word.",
    );
  }

  assertReadable(joined);
  return joined;
}
