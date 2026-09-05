export const PAYFLOW_TRANSFER_REFERENCE_PATTERN = /PF-TF-\d{8}-[A-Z0-9]{6,16}/i;

const REFERENCE_HEADERS = [
  "referencia",
  "referência",
  "referencia_payflow",
  "transfer_reference",
  "reference",
  "ref",
];
const AMOUNT_MINOR_HEADERS = ["valor_centimos", "amount_minor", "amount_cents"];
const AMOUNT_HEADERS = ["valor", "montante", "amount", "credito", "crédito", "credit"];
const CURRENCY_HEADERS = ["moeda", "currency"];
const TRANSACTION_HEADERS = [
  "movimento",
  "id_movimento",
  "bank_transaction_id",
  "transacao",
  "transação",
  "txn",
  "lote",
];
const DATE_HEADERS = ["data", "data_valor", "booked_at", "data_movimento", "valor_em"];
const DESCRIPTION_HEADERS = ["descricao", "descrição", "historico", "histórico", "narrativa", "details"];

export type BankStatementMovement = {
  line: number;
  transferReference: string | null;
  amountMinor: number | null;
  currency: string;
  bankTransactionId: string;
  bookedAt: string | null;
  description: string;
  parseErrors: string[];
};

export type PendingTransferMatchInput = {
  transferReference: string;
  expectedAmountMinor: number;
  currency: string;
  status: string;
  paymentStatus: string;
  schoolId: string;
};

export type StatementMatchOutcome =
  | "matched"
  | "amount_mismatch"
  | "currency_mismatch"
  | "unknown_reference"
  | "already_processed"
  | "duplicate_transaction"
  | "invalid_row";

export type StatementMatch = {
  line: number;
  outcome: StatementMatchOutcome;
  transferReference: string | null;
  bankTransactionId: string;
  amountMinor: number | null;
  currency: string;
  schoolId: string | null;
};

function foldHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[foldHeader(name)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

export function parseMinorUnits(raw: string): number | null {
  const compact = raw.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(compact)) return null;
  const asInteger = Number(compact);
  if (!Number.isSafeInteger(asInteger) || asInteger <= 0) return null;
  return asInteger;
}

export function parseAmountToMinor(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s/g, "").replace(/aoa/i, "");
  if (/^\d+$/.test(compact)) {
    const major = Number(compact);
    if (!Number.isSafeInteger(major) || major <= 0) return null;
    return major * 100;
  }
  let normalized = compact;
  if (compact.includes(",") && compact.includes(".")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (compact.includes(",")) {
    normalized = compact.replace(",", ".");
  }
  const major = Number(normalized);
  if (!Number.isFinite(major) || major <= 0) return null;
  return Math.round(major * 100);
}

export function extractTransferReference(value: string) {
  const upper = value.trim().toUpperCase();
  const direct = upper.match(PAYFLOW_TRANSFER_REFERENCE_PATTERN);
  return direct ? direct[0] : null;
}

function parseBookedAt(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
  }
  const dayFirst = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) {
    const iso = `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}T12:00:00.000Z`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  const isoDay = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}T12:00:00.000Z`;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function detectDelimiter(headerLine: string) {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis >= commas) return ";";
  return ",";
}

export function parseBankStatementCsv(csv: string, options?: { maxRows?: number }): BankStatementMovement[] {
  const maxRows = options?.maxRows ?? 500;
  const text = csv.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(foldHeader);
  const movements: BankStatementMovement[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    if (movements.length >= maxRows) break;
    const cells = splitCsvLine(lines[index], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      row[header] = cells[headerIndex] ?? "";
    });

    const description = pick(row, DESCRIPTION_HEADERS);
    const referenceRaw = pick(row, REFERENCE_HEADERS) || description;
    const transferReference = extractTransferReference(referenceRaw);
    const amountMinorRaw = pick(row, AMOUNT_MINOR_HEADERS);
    const amountRaw = pick(row, AMOUNT_HEADERS);
    const amountMinor = amountMinorRaw
      ? parseMinorUnits(amountMinorRaw)
      : amountRaw
        ? parseAmountToMinor(amountRaw)
        : null;
    const currency = (pick(row, CURRENCY_HEADERS) || "AOA").toUpperCase();
    const bankTransactionId = pick(row, TRANSACTION_HEADERS);
    const bookedAt = parseBookedAt(pick(row, DATE_HEADERS));
    const parseErrors: string[] = [];
    if (!transferReference) parseErrors.push("missing_reference");
    if (!amountMinor) parseErrors.push("invalid_amount");
    if (!/^[A-Z]{3}$/.test(currency)) parseErrors.push("invalid_currency");
    if (bankTransactionId.length < 3) parseErrors.push("missing_transaction_id");

    movements.push({
      line: index + 1,
      transferReference,
      amountMinor,
      currency,
      bankTransactionId: bankTransactionId.toUpperCase(),
      bookedAt,
      description,
      parseErrors,
    });
  }

  return movements;
}

export function matchStatementMovements(
  movements: BankStatementMovement[],
  pending: PendingTransferMatchInput[],
  options: { schoolId: string },
): StatementMatch[] {
  const byReference = new Map(
    pending
      .filter((item) => item.schoolId === options.schoolId)
      .map((item) => [item.transferReference.toUpperCase(), item] as const),
  );
  const usedTransactions = new Set<string>();
  return movements.map((movement) => {
    if (movement.parseErrors.length > 0 || !movement.transferReference || !movement.amountMinor) {
      return {
        line: movement.line,
        outcome: "invalid_row" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: null,
      };
    }
    if (usedTransactions.has(movement.bankTransactionId)) {
      return {
        line: movement.line,
        outcome: "duplicate_transaction" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: null,
      };
    }
    const instruction = byReference.get(movement.transferReference);
    if (!instruction) {
      return {
        line: movement.line,
        outcome: "unknown_reference" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: null,
      };
    }
    if (instruction.status === "verified" || instruction.paymentStatus === "paid") {
      return {
        line: movement.line,
        outcome: "already_processed" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: instruction.schoolId,
      };
    }
    if (instruction.currency !== movement.currency) {
      return {
        line: movement.line,
        outcome: "currency_mismatch" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: instruction.schoolId,
      };
    }
    if (instruction.expectedAmountMinor !== movement.amountMinor) {
      return {
        line: movement.line,
        outcome: "amount_mismatch" as const,
        transferReference: movement.transferReference,
        bankTransactionId: movement.bankTransactionId,
        amountMinor: movement.amountMinor,
        currency: movement.currency,
        schoolId: instruction.schoolId,
      };
    }
    usedTransactions.add(movement.bankTransactionId);
    return {
      line: movement.line,
      outcome: "matched" as const,
      transferReference: movement.transferReference,
      bankTransactionId: movement.bankTransactionId,
      amountMinor: movement.amountMinor,
      currency: movement.currency,
      schoolId: instruction.schoolId,
    };
  });
}
