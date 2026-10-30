import { z } from "zod";

const day = z.string().date().or(z.literal(""));

/** Escapa % e _ em ILIKE, impedindo que pesquisa textual alargue o filtro. */
export function receiptLikeTerm(text: string): string {
  return "%" + text.replace(/[%_\\]/g, (character) => "\\" + character) + "%";
}

/** Os mesmos filtros e limites para consulta e exportação. */
export const receiptRegisterInputSchema = z
  .object({
    receiptNumber: z.string().trim().max(100).default(""),
    invoiceNumber: z.string().trim().max(100).default(""),
    paymentReference: z.string().trim().max(160).default(""),
    studentQuery: z.string().trim().max(90).default(""),
    status: z.string().refine((value) => ["all", "issued", "reversed"].includes(value), "Estado inválido.").default("all"),
    method: z.string().refine((value) => ["all", "cash", "bank_transfer", "card", "other"].includes(value), "Método inválido.").default("all"),
    from: day.default(""),
    to: day.default(""),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .refine((row) => !row.from || !row.to || row.from <= row.to, {
    message: "O início do período não pode ultrapassar o fim.",
    path: ["to"],
  });
