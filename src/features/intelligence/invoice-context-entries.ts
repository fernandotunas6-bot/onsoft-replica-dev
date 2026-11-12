import { canReadStudentSection } from "@/features/students/student-sections";
import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Fatura (contexto financeiro): a página da fatura, a lista
 * de faturas e, quando o servidor devolveu o aluno com a fatura, o financeiro e a
 * ficha desse aluno. O aluno vem da fatura lida no servidor, nunca da URL.
 */

function invoiceFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "invoice");
}

function invoiceStudentId(trail: ContextFrame[]): string | undefined {
  return invoiceFrame(trail)?.relations?.student;
}

const studentBase = {
  group: "Aluno da fatura",
  contexts: ["invoice"],
  to: "/alunos/$studentId",
  path: (trail: ContextFrame[]) => `/alunos/${invoiceStudentId(trail) ?? ""}`,
  module: "pessoas",
  available: (trail: ContextFrame[]) => Boolean(invoiceStudentId(trail)),
} satisfies Partial<ContextNavEntry>;

export const INVOICE_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    id: "invoice.overview",
    label: "Detalhes e recibos",
    icon: moduleIcons.receipts,
    group: "Fatura",
    contexts: ["invoice"],
    to: "/faturas/$invoiceId",
    path: (trail) => `/faturas/${invoiceFrame(trail)?.id ?? ""}`,
    module: "financeiro",
    order: 0,
  },
  {
    id: "invoice.list",
    label: "Todas as faturas",
    icon: moduleIcons.finance,
    group: "Fatura",
    contexts: ["invoice"],
    to: "/faturas",
    module: "financeiro",
    order: 10,
  },
  {
    // As outras faturas do aluno, onde se recebem e anulam (a tesouraria não abre fichas).
    id: "invoice.student-invoices",
    label: "Faturas do aluno",
    icon: moduleIcons.finance,
    group: "Aluno da fatura",
    contexts: ["invoice"],
    to: "/faturas",
    search: (trail) => ({ aluno: invoiceStudentId(trail) }),
    module: "financeiro",
    available: (trail) => Boolean(invoiceStudentId(trail)),
    order: 15,
  },
  {
    ...studentBase,
    id: "invoice.student-finance",
    label: "Financeiro do aluno",
    icon: moduleIcons.finance,
    search: () => ({ secao: "financeiro" }),
    // O mesmo que o servidor deixa ler as faturas do aluno.
    allow: (role, grants) => canReadStudentSection("financeiro", role, grants),
    order: 20,
  },
  {
    ...studentBase,
    id: "invoice.student",
    label: "Ficha do aluno",
    icon: moduleIcons.profile,
    order: 30,
  },
];

export const INVOICE_CONTEXT_MODULE: ContextModule = {
  kinds: { invoice: "Fatura" },
  entries: INVOICE_CONTEXT_ENTRIES,
  // A fatura é da tesouraria: `/faturas` abre-se à Administração e à Tesouraria.
  menuRoles: ["Administrador", "Tesouraria"],
  back: () => ({ to: "/faturas" }),
};
