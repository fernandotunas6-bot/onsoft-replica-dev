/**
 * Cliente falso com os dois limites do PostgREST que cortam leituras em silêncio ou
 * as fazem falhar: no máximo 1000 linhas por pedido (sem erro) e um URL com tamanho
 * máximo (um `.in(...)` com centenas de uuids falha).
 */
type Row = Record<string, unknown>;
export type FakeFailure = { table: string; error: { code?: string; message: string } };

export const FAKE_MAX_ROWS = 1000;
/** ~ 8 KB de URL: 200 uuids. */
export const FAKE_MAX_IN_LIST = 200;

export function fakePostgrest(tables: Record<string, Row[]>, failure?: FakeFailure) {
  const calls = { requests: 0 };
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let range: [number, number] | null = null;
      let ordered = false;
      let urlTooLong = false;
      let single = false;
      const query = {
        select: (..._args: unknown[]) => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return query;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          if (values.length > FAKE_MAX_IN_LIST) urlTooLong = true;
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        order: () => {
          ordered = true;
          return query;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return query;
        },
        limit: (count: number) => {
          range = [0, count - 1];
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        then(resolve: (value: { data: Row[] | Row | null; error: unknown }) => void) {
          calls.requests += 1;
          if (failure?.table === table) return resolve({ data: null, error: failure.error });
          if (urlTooLong) {
            return resolve({ data: null, error: { message: "414 URI Too Long" } });
          }
          let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          if (ordered) rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (single) return resolve({ data: rows[0] ?? null, error: null });
          resolve({ data: rows.slice(0, FAKE_MAX_ROWS), error: null });
        },
      };
      return query;
    },
  };
  return { client, calls };
}

export const fakeId = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, "0")}`;
