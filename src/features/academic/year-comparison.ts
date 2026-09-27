/**
 * Comparativo entre anos lectivos (servidor), a partir do histórico académico
 * oficial (`student_academic_history`, tabela só do servidor). Devolve apenas
 * números agregados por ano e por classe — nunca nomes nem registos de alunos.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { yearComparison, type HistoryRecord, type YearComparison } from "./academic-analytics";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const PAGE = 1000;
const MAX_ROWS = 50_000;

export const getYearComparison = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YearComparison> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const records: HistoryRecord[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await db
        .from("student_academic_history")
        .select("academic_year_label, grade_level, final_average, outcome")
        .eq("school_id", schoolId)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw publicDatabaseError(error, "Não foi possível ler o histórico académico.");
      for (const r of (data ?? []) as Row[]) {
        records.push({
          yearLabel: str(r.academic_year_label),
          gradeLevel: str(r.grade_level),
          finalAverage: r.final_average == null ? null : Number(r.final_average),
          outcome: r.outcome == null ? null : str(r.outcome),
        });
      }
      if ((data ?? []).length < PAGE) break;
    }

    // Ordem cronológica pelos anos lectivos da escola (data de início).
    const { data: years } = await db
      .from("academic_years")
      .select("name, starts_on")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: true });
    const order = ((years ?? []) as Row[]).map((y) => str(y.name));

    return yearComparison(records, order);
  });
