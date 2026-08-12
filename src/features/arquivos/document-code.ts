/** IDs simples da biblioteca SIGA para pesquisa rápida (ex.: REC-260812-K4M2). */

export const documentCodePrefixes = {
  arq: "ARQ",
  recibo: "REC",
  talao: "TAL",
  fatura: "FAT",
  foto: "FOT",
  bilhete: "BI",
  certificado: "CER",
  contrato: "CTR",
  pauta: "PTA",
  comunicado: "COM",
  material_aula: "MAT",
  outro: "DOC",
} as const;

export type DocumentCodeKind = keyof typeof documentCodePrefixes;

const CODE_RE = /^[A-Z]{2,4}-\d{6}-[A-Z0-9]{4}$/;

function yymmdd(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function randomSuffix(length = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function normalizeDocumentCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isDocumentCode(value: string) {
  return CODE_RE.test(normalizeDocumentCode(value));
}

export function prefixForCategory(category: string | null | undefined): DocumentCodeKind {
  if (category && category in documentCodePrefixes) {
    return category as DocumentCodeKind;
  }
  return "arq";
}

/** Gera ID curto e estável para pesquisa (PREFIX-AAMMDD-XXXX). */
export function generateDocumentCode(
  kind: DocumentCodeKind | string = "arq",
  at: Date = new Date(),
) {
  const key = (kind in documentCodePrefixes ? kind : "arq") as DocumentCodeKind;
  const prefix = documentCodePrefixes[key];
  return `${prefix}-${yymmdd(at)}-${randomSuffix(4)}`;
}

/**
 * ID determinístico a partir de um UUID/chave (ex.: plano, recibo) para
 * reimpressões não duplicarem o arquivo na biblioteca.
 */
export function stableDocumentCode(
  kind: DocumentCodeKind | string,
  entityKey: string,
  at: Date = new Date(),
) {
  const key = (kind in documentCodePrefixes ? kind : "arq") as DocumentCodeKind;
  const prefix = documentCodePrefixes[key];
  const alnum = entityKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const digitsOnly = entityKey.replace(/\D/g, "");
  const mid =
    digitsOnly.length >= 6
      ? digitsOnly.slice(0, 6)
      : Array.from(alnum.padEnd(6, "0").slice(0, 6), (ch) =>
          /\d/.test(ch) ? ch : String((ch.charCodeAt(0) - 65) % 10),
        ).join("") || yymmdd(at);
  const suffix = (alnum.slice(-4) || randomSuffix(4)).padStart(4, "X").slice(-4);
  return `${prefix}-${mid}-${suffix}`;
}

export function documentCodeSearchHint() {
  return "Ex.: REC-260812-K4M2";
}
