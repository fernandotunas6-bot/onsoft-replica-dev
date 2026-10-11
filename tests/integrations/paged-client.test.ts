import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PagedReadError, pagedReadClient } from "@/integrations/supabase/paged-client";
import { fakeId, fakePostgrest } from "../helpers/fake-postgrest";

/**
 * A exportação de dados lia cada tabela num só pedido: o PostgREST devolve no máximo
 * 1000 linhas (sem erro) e um `.in(...)` longo passa o tamanho do URL. O cliente
 * paginado repete a leitura por páginas e divide o `.in` em lotes.
 */
type Row = Record<string, unknown>;
const SCHOOL = "school";
const students = Array.from({ length: 2500 }, (_, n) => ({
  id: fakeId("s", n),
  school_id: SCHOOL,
  deleted_at: n % 10 === 0 ? "2026-01-01" : null,
}));

function client(failure?: Parameters<typeof fakePostgrest>[1]) {
  const fake = fakePostgrest({ students }, failure);
  return { db: pagedReadClient(fake.client, { strict: true }), calls: fake.calls };
}

describe("pagedReadClient", () => {
  it("lê todas as linhas de uma lista, com os filtros", async () => {
    const { db } = client();
    const { data, error } = (await db
      .from("students")
      .select("id")
      .eq("school_id", SCHOOL)
      .is("deleted_at", null)) as { data: Row[]; error: unknown };
    expect(error).toBeNull();
    expect(data).toHaveLength(2250);
    expect(new Set(data.map((row) => row.id)).size).toBe(2250);
  });

  it("divide um .in longo em lotes", async () => {
    const { db } = client();
    const ids = students.slice(0, 700).map((s) => s.id);
    const { data, error } = (await db.from("students").select("id").in("id", ids)) as {
      data: Row[];
      error: unknown;
    };
    expect(error).toBeNull();
    expect(data).toHaveLength(700);
  });

  it("um erro de leitura lança (nenhum ficheiro parcial)", async () => {
    const { db } = client({ table: "students", error: { message: "timeout", code: "57014" } });
    await expect(db.from("students").select("id")).rejects.toBeInstanceOf(PagedReadError);
  });

  it("a tabela em falta continua a devolver o erro", async () => {
    const { db } = client({
      table: "students",
      error: { code: "42P01", message: 'relation "students" does not exist' },
    });
    const { data, error } = (await db.from("students").select("id")) as {
      data: unknown;
      error: { code: string } | null;
    };
    expect(data).toBeNull();
    expect(error?.code).toBe("42P01");
  });

  it("maybeSingle e limit passam tal e qual, num só pedido", async () => {
    const { db, calls } = client();
    const one = (await db.from("students").select("id").eq("id", fakeId("s", 7)).maybeSingle()) as {
      data: Row | null;
    };
    expect(one.data?.id).toBe(fakeId("s", 7));
    const some = (await db.from("students").select("id").limit(5)) as { data: Row[] };
    expect(some.data).toHaveLength(5);
    expect(calls.requests).toBe(2);
  });

  it("a exportação de dados usa o cliente paginado", () => {
    const source = readFileSync("src/features/import/export-engine.ts", "utf8");
    expect(source).toMatch(/const db = pagedReadClient\(client, \{ strict: true \}\)/);
  });
});
