import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { parseStudentFinance, invoiceAmounts, type StudentFinance } from "../src/domain/finance";
import { InstitutionalFinance } from "../src/components/InstitutionalFinance";
import type { Context, Gateway } from "../src/domain/model";
import type { AcademicCatalog } from "../src/domain/catalog";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { schoolId: id(1), userId: id(2), role: "aluno" };
const catalog: AcademicCatalog = {
  schoolId: ctx.schoolId,
  role: ctx.role,
  classes: [],
  timetable: [],
  tasks: [],
};
const data = (): StudentFinance => ({
  schoolId: ctx.schoolId,
  userId: ctx.userId,
  role: "aluno",
  invoices: [
    {
      id: id(3),
      number: "FT-001",
      label: "Propina Outubro",
      competence: "2026-10-01",
      due: "2026-10-31",
      status: "partially_paid",
      amountCents: 10000,
      discountCents: 1000,
      penaltyCents: 500,
      receipts: [
        {
          id: id(4),
          number: "RC-001",
          amountCents: 5000,
          paidOn: "2026-10-10",
          method: "bank_transfer",
          status: "issued",
        },
        {
          id: id(5),
          number: "RC-002",
          amountCents: 4000,
          paidOn: "2026-10-09",
          method: "cash",
          status: "reversed",
        },
      ],
    },
  ],
});
afterEach(() => cleanup());
it("counts only issued receipts and uses exact minor units", () => {
  const i = parseStudentFinance(data(), ctx).invoices[0];
  expect(invoiceAmounts(i)).toEqual({ total: 9500, paid: 5000, remaining: 4500 });
  i.status = "cancelled";
  expect(invoiceAmounts(i).remaining).toBe(0);
});
it.each([
  "school",
  "user",
  "role",
  "private",
  "negative",
  "decimal",
  "receipt",
  "date",
  "duplicate",
  "method",
])("rejects %s leakage or invalid money", (kind) => {
  const d = data(),
    i = d.invoices[0];
  if (kind === "school") d.schoolId = id(99);
  if (kind === "user") d.userId = id(99);
  if (kind === "role") Object.assign(d, { role: "professor" });
  if (kind === "private") Object.assign(i, { bankAccount: "private" });
  if (kind === "negative") i.amountCents = -1;
  if (kind === "decimal") i.amountCents = 100.1;
  if (kind === "receipt") i.receipts[0].amountCents = Number.MAX_SAFE_INTEGER + 1;
  if (kind === "date") i.due = "2026-02-31";
  if (kind === "duplicate") i.receipts.push(i.receipts[0]);
  if (kind === "method") Object.assign(i.receipts[0], { method: "multicaixa_fake" });
  expect(() => parseStudentFinance(d, ctx)).toThrow("Contrato de propinas");
});
it("reads own invoices, receipt reversals, paid filter and real PayFlow link", async () => {
  const read = vi.fn().mockResolvedValue(data()),
    g = { studentFinance: read } as unknown as Gateway;
  const view = render(<InstitutionalFinance ctx={ctx} catalog={catalog} gateway={g} />);
  await screen.findByText("Propina Outubro");
  expect(screen.getByRole("link", { name: "Pagar no PayFlow" }).getAttribute("href")).toMatch(
    /\/aluno\/pagar$/,
  );
  fireEvent.click(screen.getByText("Recibos (2)"));
  expect(screen.getByText(/Estornado/)).toBeTruthy();
  view.rerender(<InstitutionalFinance ctx={ctx} catalog={catalog} gateway={g} paidOnly />);
  await screen.findByText("Sem cobranças para os filtros seleccionados.");
  expect(screen.queryByText("Propina Outubro")).toBeNull();
});
