import type { Context } from "./model";
export interface StudentFinance {
  schoolId: string;
  userId: string;
  role: "aluno";
  invoices: {
    id: string;
    number: string;
    label: string;
    competence: string | null;
    due: string;
    status: "open" | "partially_paid" | "paid" | "cancelled";
    amountCents: number;
    discountCents: number;
    penaltyCents: number;
    receipts: {
      id: string;
      number: string;
      amountCents: number;
      paidOn: string;
      method: "cash" | "bank_transfer" | "card" | "other";
      status: "issued" | "reversed";
    }[];
  }[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) =>
  Object.keys(v).length === k.length && k.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown) => typeof v === "string" && !!v.trim() && v.length <= 500;
const cents = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function parseStudentFinance(value: unknown, ctx: Context): StudentFinance {
  const invalid = (): never => {
    throw new Error("Contrato de propinas inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "userId", "role", "invoices"]) ||
    ctx.role !== "aluno" ||
    value.role !== ctx.role ||
    value.schoolId !== ctx.schoolId ||
    value.userId !== ctx.userId ||
    !Array.isArray(value.invoices) ||
    value.invoices.length > 1000
  )
    return invalid();
  const ids = new Set<string>(),
    receipts = new Set<string>();
  let count = 0;
  for (const i of value.invoices) {
    if (
      !object(i) ||
      !keys(i, [
        "id",
        "number",
        "label",
        "competence",
        "due",
        "status",
        "amountCents",
        "discountCents",
        "penaltyCents",
        "receipts",
      ]) ||
      !uuid(i.id) ||
      ids.has(i.id) ||
      !text(i.number) ||
      !text(i.label) ||
      !date(i.due) ||
      (i.competence !== null && (!date(i.competence) || !i.competence.endsWith("-01"))) ||
      !["open", "partially_paid", "paid", "cancelled"].includes(String(i.status)) ||
      !cents(i.amountCents) ||
      !cents(i.discountCents) ||
      !cents(i.penaltyCents) ||
      !Number.isSafeInteger(i.amountCents - i.discountCents + i.penaltyCents) ||
      !Array.isArray(i.receipts)
    )
      return invalid();
    ids.add(i.id);
    let sum = 0;
    for (const r of i.receipts) {
      if (
        ++count > 1000 ||
        !object(r) ||
        !keys(r, ["id", "number", "amountCents", "paidOn", "method", "status"]) ||
        !uuid(r.id) ||
        receipts.has(r.id) ||
        !text(r.number) ||
        !cents(r.amountCents) ||
        r.amountCents === 0 ||
        !date(r.paidOn) ||
        !["cash", "bank_transfer", "card", "other"].includes(String(r.method)) ||
        !["issued", "reversed"].includes(String(r.status))
      )
        return invalid();
      receipts.add(r.id);
      if (r.status === "issued") sum += r.amountCents;
      if (!Number.isSafeInteger(sum)) return invalid();
    }
  }
  return value as unknown as StudentFinance;
}
export function invoiceAmounts(i: StudentFinance["invoices"][number]) {
  const total = Math.max(0, i.amountCents - i.discountCents + i.penaltyCents);
  const paid = i.receipts
    .filter((r) => r.status === "issued")
    .reduce((sum, r) => sum + r.amountCents, 0);
  return { total, paid, remaining: i.status === "cancelled" ? 0 : Math.max(0, total - paid) };
}
