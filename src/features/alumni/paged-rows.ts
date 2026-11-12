import { selectAllPages } from "@/features/import/engine/paged";

type AnyClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Todas as linhas da escola numa tabela, em páginas. Os painéis de antigos alunos
 * contavam sobre leituras que o PostgREST corta aos 1000 sem aviso.
 * Devolve `{ data }` para encaixar nos `Promise.all` existentes.
 */
export async function allSchoolRows(
  db: AnyClient,
  table: string,
  columns: string,
  schoolId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any[] }> {
  const data = await selectAllPages(
    (from, to) =>
      db.from(table).select(`id, ${columns}`).eq("school_id", schoolId).order("id").range(from, to),
    `Não foi possível ler ${table}`,
  );
  return { data };
}
