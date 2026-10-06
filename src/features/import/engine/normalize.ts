/**
 * Normalização de células de Excel/CSV antes da comparação/gravação.
 * Nunca reescreve o valor original guardado em `raw_data` — só o que entra
 * em `normalized_data` e é efectivamente gravado nas tabelas do SIGA.
 */

const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u00A0]/g;

/** Remove espaços duplicados, caracteres invisíveis e aparas nas pontas. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(INVISIBLE_CHARS, " ").replace(/\s+/g, " ").trim();
  return str;
}

/** Versão sem acentos, minúsculas — só para comparação, nunca para gravar. */
export function foldForCompare(value: unknown): string {
  return normalizeText(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Datas em Excel chegam como número de série (dias desde 1899-12-30) quando a
 * célula tem formato de data, ou como texto em vários formatos quando não tem.
 * Devolve sempre "AAAA-MM-DD" ou null se não for reconhecível.
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = EXCEL_EPOCH_MS + value * 86_400_000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const str = normalizeText(value);
  if (!str) return null;
  // AAAA-MM-DD ou AAAA/MM/DD
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return isoFrom(Number(m[1]), Number(m[2]), Number(m[3]));
  // DD-MM-AAAA ou DD/MM/AAAA (formato mais comum em Angola/Portugal)
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return isoFrom(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function isoFrom(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

/** Números guardados como texto ("1.234,56", "1234.56") → number. */
export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let str = normalizeText(value).replace(/[^\d,.-]/g, "");
  if (!str) return null;
  // "1.234,56" (formato PT/AO) vs "1,234.56" (formato EN): decide pelo último separador.
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma > lastDot) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma !== -1) {
    str = str.replace(/,/g, "");
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor em kwanzas. Como normalizeNumber, mas um separador seguido de exactamente três
 * dígitos é de milhares: «35.000», «1.250.000» e «35,000» são 35 000 e 1 250 000. O
 * kwanza só tem cêntimos (duas casas), por isso três casas decimais nunca são um valor;
 * normalizeNumber lia «35.000», escrito num CSV, como 35.
 */
export function normalizeMoney(value: unknown): number | null {
  if (typeof value !== "number") {
    const str = normalizeText(value).replace(/[^\d,.-]/g, "");
    if (/^-?\d{1,3}(\.\d{3})+$/.test(str) || /^-?\d{1,3}(,\d{3})+$/.test(str)) {
      return Number(str.replace(/[.,]/g, ""));
    }
  }
  return normalizeNumber(value);
}

/** Telefone: mantém só dígitos, remove indicativo 244/+244 quando presente. */
export function normalizePhoneDigits(value: unknown): string | null {
  const str = normalizeText(value).replace(/[^\d]/g, "");
  if (!str) return null;
  if (str.startsWith("244") && str.length === 12) return str.slice(3);
  if (str.length >= 9) return str.slice(-9);
  return str || null;
}

export function normalizeGender(value: unknown): "male" | "female" | null {
  const str = foldForCompare(value);
  if (!str) return null;
  if (["m", "masculino", "male", "homem"].includes(str)) return "male";
  if (["f", "feminino", "female", "mulher"].includes(str)) return "female";
  return null;
}

export function isBlankRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => normalizeText(v) === "");
}
