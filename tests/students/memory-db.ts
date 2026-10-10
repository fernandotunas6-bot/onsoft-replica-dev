/**
 * Base em memória com o subconjunto do construtor do Supabase que o núcleo da
 * matrícula usa (select/insert/update, eq/in/is, order/limit/range,
 * maybeSingle/single e contagem). Só para testes.
 */
type Row = Record<string, unknown>;

export type WriteLog = Array<{ table: string; op: "insert" | "update"; rows: Row[]; patch?: Row }>;

export function memoryDb(tables: Record<string, Row[]>) {
  const writes: WriteLog = [];

  function from(table: string) {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    let head = false;
    let withCount = false;
    let start = 0;
    let end = Number.POSITIVE_INFINITY;
    const filters: Array<(row: Row) => boolean> = [];
    const rows = () => (tables[table] ??= []);
    const matching = () => rows().filter((row) => filters.every((filter) => filter(row)));

    const run = () => {
      if (op === "update") {
        const hit = matching();
        for (const row of hit) Object.assign(row, patch);
        writes.push({ table, op, rows: hit.map((row) => ({ ...row })), patch });
        return { data: hit, error: null, count: null };
      }
      if (op === "insert") {
        const added = inserted.map((row) => ({ id: `${table}-${rows().length + 1}`, ...row }));
        rows().push(...added);
        writes.push({ table, op, rows: added });
        return { data: added, error: null, count: null };
      }
      const hit = matching();
      return {
        data: head ? null : hit.slice(start, end + 1),
        error: null,
        count: withCount ? hit.length : null,
      };
    };

    const chain = {
      select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
        head = Boolean(options?.head);
        withCount = Boolean(options?.count);
        return chain;
      },
      update: (value: Row) => {
        op = "update";
        patch = value;
        return chain;
      },
      insert: (value: Row | Row[]) => {
        op = "insert";
        inserted = Array.isArray(value) ? value : [value];
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator === "is" && value === null) filters.push((row) => row[column] != null);
        else filters.push((row) => row[column] !== value);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      range: (from: number, to: number) => {
        start = from;
        end = to;
        return chain;
      },
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as Row[] | null)?.[0] ?? null, error: null };
      },
      single: async () => {
        const { data } = run();
        return { data: (data as Row[] | null)?.[0] ?? null, error: null };
      },
      then: <T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (e: unknown) => T) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }

  return { db: { from } as never, tables, writes };
}
