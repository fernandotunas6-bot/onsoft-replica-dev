import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const SEQUENTIAL = /^DOC-(\d{6})$/;

/**
 * Número de professor seguinte (`DOC-000123`): o maior número sequencial da escola + 1.
 *
 * Havia duas cópias (Novo professor e a ligação de um login a um professor) que
 * contavam os professores e somavam 1. Com um número em falta — um professor
 * importado com outro formato, ou um número escrito à mão — a contagem repetia um
 * número já usado e a criação falhava com «chave duplicada».
 */
export async function nextTeacherEmployeeNumber(db: AdminDb, schoolId: string): Promise<string> {
  const { data, error } = await db
    .from("teachers")
    .select("employee_number")
    .eq("school_id", schoolId)
    .like("employee_number", "DOC-%");
  if (error) throw publicDatabaseError(error, "Não foi possível numerar o professor.");
  let highest = 0;
  for (const row of data ?? []) {
    const match = SEQUENTIAL.exec(String(row.employee_number ?? ""));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `DOC-${String(highest + 1).padStart(6, "0")}`;
}

/** O número já está noutro professor da escola (`teachers_school_id_employee_number_key`). */
export function isTeacherNumberTaken(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && error.code === "23505" && /employee_number/i.test(String(error.message ?? "")),
  );
}

/**
 * Insere o professor com o número seguinte; se outro pedido ao mesmo tempo ficar com
 * esse número, tenta de novo com o seguinte (até três vezes).
 */
export async function insertTeacherWithNextNumber<
  R extends { error: { code?: string; message?: string } | null },
>(db: AdminDb, schoolId: string, insert: (employeeNumber: string) => PromiseLike<R>): Promise<R> {
  let result = await insert(await nextTeacherEmployeeNumber(db, schoolId));
  for (let attempt = 1; attempt < 3 && isTeacherNumberTaken(result.error); attempt += 1) {
    result = await insert(await nextTeacherEmployeeNumber(db, schoolId));
  }
  return result;
}
