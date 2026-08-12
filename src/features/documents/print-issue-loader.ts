import type { PrintSchoolContext, PrintStudentContext } from "@/features/documents/print-catalog";

/** Carrega o motor de impressão só ao clicar — evita ~450 kB no bundle inicial. */
export async function issuePrintDocument(input: {
  tipo: string;
  school: PrintSchoolContext;
  student?: PrintStudentContext;
  overlay?: Record<string, unknown>;
  fallback?: () => void;
}) {
  const mod = await import("@/features/documents/print-issue");
  return mod.issuePrintDocument(input);
}

export async function printBundledTemplate(input: {
  key: string;
  school: PrintSchoolContext;
  student?: PrintStudentContext;
  overlay?: Record<string, unknown>;
}) {
  const mod = await import("@/features/documents/print-issue");
  return mod.printBundledTemplate(input);
}
