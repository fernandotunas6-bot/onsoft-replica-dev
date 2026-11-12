import { vi } from "vitest";
export function schoolWebsiteTestDb(tables: Record<string, Record<string, unknown>[]>) {
  const calls: { table: string; filters: [string, unknown][]; columns: string }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as [string, unknown][], columns: "" };
    calls.push(call);
    let start = 0,
      end = Infinity;
    const rows = () =>
      (tables[table] ?? []).filter((row) =>
        call.filters.every(([key, value]) =>
          key === "$prefix"
            ? String(row.domain).startsWith(String(value))
            : key === "value->>isPublished"
              ? String((row.value as Record<string, unknown>)?.isPublished) === value
              : row[key] === value,
        ),
      );
    const result = () => ({
      data: rows().slice(start, end + 1),
      error: null,
      count: rows().length,
    });
    const chain = {
      select: (columns: string) => {
        call.columns = columns;
        return chain;
      },
      eq: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return chain;
      },
      like: (_key: string, value: string) => {
        call.filters.push(["$prefix", value.replace(/\\_/g, "_").replace(/%$/, "")]);
        return chain;
      },
      order: () => chain,
      range: (first: number, last: number) => {
        start = first;
        end = last;
        return chain;
      },
      single: async () => ({
        data: rows()[0] ?? null,
        error: rows()[0] ? null : { message: "Not found" },
      }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: vi.fn(async () => ({ error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  });
  return { from, calls, rpc: vi.fn(async () => ({ data: true, error: null })) };
}
