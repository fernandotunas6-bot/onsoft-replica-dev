import type { SupabaseClient } from "@supabase/supabase-js";
import { schoolTodayIso } from "@/lib/school-date";

// Tipos do SGA divergem dos gerados (mesma convenção de sga-grades.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/**
 * Numeração fiscal das faturas: FT-AAAA/NNNN, por escola e por ano.
 *
 * O próximo número é o maior já usado no ano + 1 — não a contagem + 1. Com buracos
 * (faturas importadas com o número de origem, por exemplo FT-2026/0129) a contagem
 * apontava para números já ocupados; a emissão só tentava 5 vezes, e os importadores
 * começavam sempre em 1, por isso falhavam em qualquer escola com 5 faturas no ano.
 */
export function nextInvoiceSequence(numbers: Iterable<string | null | undefined>, year: number) {
  const pattern = new RegExp(`^FT-${year}/(\\d+)$`, "i");
  let highest = 0;
  for (const number of numbers) {
    const match = pattern.exec(String(number ?? "").trim());
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

/** Ano da numeração pela data da escola (Luanda), não pelo relógio UTC do servidor. */
export function invoiceYearForSchool(now: Date = new Date()) {
  return Number(schoolTodayIso(now).slice(0, 4));
}

export function formatInvoiceNumber(year: number, sequence: number) {
  return `FT-${year}/${String(sequence).padStart(4, "0")}`;
}

const PAGE = 1000;

/**
 * Próximo número livre do ano, lendo TODOS os números FT-AAAA/… da escola. O PostgREST
 * devolve no máximo 1000 linhas por pedido: uma escola com 1000 alunos passa disso num
 * ano, e com a lista cortada o «maior» seria o errado.
 */
export async function loadNextInvoiceSequence(
  db: Db,
  schoolId: string,
  year: number,
): Promise<number> {
  const numbers: Array<string | null> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("finance_invoices")
      .select("invoice_number")
      .eq("school_id", schoolId)
      .like("invoice_number", `FT-${year}/%`)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Não foi possível numerar a fatura: ${error.message}`);
    for (const row of (data ?? []) as Array<{ invoice_number: string | null }>) {
      numbers.push(row.invoice_number);
    }
    if (!data || data.length < PAGE) break;
  }
  return nextInvoiceSequence(numbers, year);
}
