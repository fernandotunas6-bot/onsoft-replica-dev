import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateSettingsDomainValue } from "@/features/school/settings-domains";

type Row = { id: string; version: number; value: unknown };

/** Base de dados mínima: uma linha; `interfere` simula outra gravação antes do update. */
function fakeDb(initial: Row | null, interfere?: (row: Row) => void) {
  const state = { row: initial, updates: 0 };
  const db = {
    from: () => {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => ({ data: state.row ? { ...state.row } : null, error: null }),
        update: (values: Record<string, unknown>) => {
          patch = values;
          return chain;
        },
        insert: async (values: Record<string, unknown>) => {
          state.row = { id: "r1", version: 1, value: values.value };
          return { error: null };
        },
        then: (resolve: (result: unknown) => void) => {
          // Fim de uma cadeia de update(...).eq(...).select("id")
          if (patch && state.row) {
            if (interfere && state.updates === 0) interfere(state.row);
            state.updates += 1;
            if (filters.version !== state.row.version) return resolve({ data: [], error: null });
            state.row = { ...state.row, value: patch.value, version: Number(patch.version) };
            return resolve({ data: [{ id: state.row.id }], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, state };
}

describe("updateSettingsDomainValue", () => {
  it("cria a linha quando não existe", async () => {
    const { db, state } = fakeDb(null);
    await updateSettingsDomainValue(db, "s1", "print_templates", () => ({ a: 1 }), "u1");
    expect(state.row?.value).toEqual({ a: 1 });
  });

  it("não perde a gravação alheia: relê e reaplica a alteração", async () => {
    const { db, state } = fakeDb({ id: "r1", version: 1, value: { a: 1 } }, (row) => {
      // Outra pessoa gravou «b» entre a nossa leitura e a nossa escrita.
      row.value = { ...(row.value as object), b: 2 };
      row.version = 2;
    });
    await updateSettingsDomainValue(
      db,
      "s1",
      "print_templates",
      (current) => ({ ...(current as object), c: 3 }),
      "u1",
    );
    expect(state.row?.value).toEqual({ a: 1, b: 2, c: 3 });
    expect(state.row?.version).toBe(3);
  });
});
