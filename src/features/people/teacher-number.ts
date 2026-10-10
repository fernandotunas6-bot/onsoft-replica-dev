import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  IDENTIFIER_POLICIES,
  insertWithSequentialCode,
  nextSequentialCode,
} from "@/features/education-catalog/identifiers";

/** O cliente do servidor ou o da importação: só lê `teachers.employee_number`. */
type Db = Pick<SupabaseClient, "from">;

/**
 * Número de professor (`DOC-000123`): o maior número da escola + 1, pela política de
 * identificadores (`IDENTIFIER_POLICIES.teacher`).
 *
 * Havia três numerações: duas cópias (Novo professor e a ligação de um login a um
 * professor) que contavam os professores e somavam 1, e a importação, que usava
 * `DOC-` com um pedaço do id da pessoa. Com um número em falta, a contagem repetia um
 * número já usado e a criação falhava com «chave duplicada». Os três sítios usam
 * agora isto, e `register_teacher` (migração 20261010110000) a mesma regra na base.
 */
export const TEACHER_NUMBER_POLICY = {
  prefix: IDENTIFIER_POLICIES.teacher.prefix,
  padding: IDENTIFIER_POLICIES.teacher.padding,
  constraint: "teachers_school_id_employee_number_key",
};

export async function loadTeacherNumbers(db: Db, schoolId: string): Promise<string[]> {
  const { data, error } = await db
    .from("teachers")
    .select("employee_number")
    .eq("school_id", schoolId)
    .ilike("employee_number", `${TEACHER_NUMBER_POLICY.prefix}-%`);
  if (error) throw publicDatabaseError(error, "Não foi possível numerar o professor.");
  return ((data ?? []) as Array<{ employee_number: string | null }>).map((row) =>
    String(row.employee_number ?? ""),
  );
}

export async function nextTeacherEmployeeNumber(db: Db, schoolId: string): Promise<string> {
  return nextSequentialCode(
    await loadTeacherNumbers(db, schoolId),
    TEACHER_NUMBER_POLICY.prefix,
    TEACHER_NUMBER_POLICY.padding,
  );
}

/** O número já está noutro professor da escola. */
export function isTeacherNumberTaken(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    error.code === "23505" &&
    String(error.message ?? "").includes(TEACHER_NUMBER_POLICY.constraint),
  );
}

/**
 * Insere o professor com o número seguinte; se outro pedido ficar com esse número ao
 * mesmo tempo, tenta o seguinte.
 */
export function insertTeacherWithNextNumber<
  R extends { data: unknown; error: { code?: string; message?: string } | null },
>(db: Db, schoolId: string, insert: (employeeNumber: string) => PromiseLike<R>): Promise<R> {
  return insertWithSequentialCode({
    ...TEACHER_NUMBER_POLICY,
    loadExisting: () => loadTeacherNumbers(db, schoolId),
    insert,
  }) as Promise<R>;
}
