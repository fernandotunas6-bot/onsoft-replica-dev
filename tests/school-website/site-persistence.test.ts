import { describe, expect, it } from "vitest";
import { appendSchoolSiteVersion, latestSchoolSiteRow } from "@/features/school-site/persistence";
import {
  defaultSchoolSiteSettings,
  withDraft,
  withPublication,
  withoutPublication,
  type SchoolSiteSettings,
} from "@/features/school-site/schema";

type RecordRow = {
  id: string;
  school_id: string;
  domain: string;
  version: number;
  value: SchoolSiteSettings;
  changed_by: string;
};

function database() {
  const rows: RecordRow[] = [];
  let nextId = 1;
  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let sortDescending = false;
    let rowInsert: RecordRow | null = null;
    const query = {
      select: () => query,
      eq: (name: string, value: unknown) => {
        filters.push([name, value]);
        return query;
      },
      order: (_name: string, options: { ascending: boolean }) => {
        sortDescending = !options.ascending;
        return query;
      },
      limit: (_amount: number) => query,
      insert: (input: Omit<RecordRow, "id">) => {
        rowInsert = { ...input, id: String(nextId++) };
        return query;
      },
      maybeSingle: async () => {
        const found = rows
          .filter((row) => filters.every(([key, val]) => row[key as keyof RecordRow] === val))
          .sort((a, b) => (sortDescending ? b.version - a.version : a.version - b.version));
        return { data: found[0] ?? null, error: null };
      },
      single: async () => {
        if (table === "schools") return { data: { name: "Colégio Esperança" }, error: null };
        if (!rowInsert) return { data: null, error: { code: "42501" } };
        if (
          rows.some(
            (r) =>
              r.school_id === rowInsert!.school_id &&
              r.domain === rowInsert!.domain &&
              r.version === rowInsert!.version,
          )
        )
          return { data: null, error: { code: "23505" } };
        rows.push(rowInsert);
        return { data: { version: rowInsert.version }, error: null };
      },
    };
    return query;
  }

  type Db = Parameters<typeof appendSchoolSiteVersion>[0];
  return { rows, db: { from } as unknown as Db };
}

describe("school-site — versões append-only e RLS", () => {
  it("começa com versão 0, guarda rascunho 1 e publica versão 2", async () => {
    const store = database();
    expect(await latestSchoolSiteRow(store.db, "school-A")).toBeNull();
    const first = await appendSchoolSiteVersion(store.db, "school-A", "admin-A", 0, (site) =>
      withDraft(site, { ...site.draft, tagline: "Nova mensagem" }),
    );
    expect(first).toBe(1);
    expect(store.rows[0]?.value.published).toBeNull();

    const published = await appendSchoolSiteVersion(
      store.db,
      "school-A",
      "admin-A",
      first,
      (site) => withPublication(site),
    );
    expect(published).toBe(2);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[0]?.value.published).toBeNull();
    expect(store.rows[1]?.value.published?.tagline).toBe("Nova mensagem");
    expect((await latestSchoolSiteRow(store.db, "school-A"))?.version).toBe(2);
    expect(store.rows.every((r) => r.school_id === "school-A")).toBe(true);
    expect(store.rows.every((r) => r.changed_by === "admin-A")).toBe(true);
  });

  it("não modifica a publicação anterior quando altera o rascunho", async () => {
    const store = database();
    const oldPublished = withPublication(defaultSchoolSiteSettings("Colégio Esperança"));
    store.rows.push({
      id: "1",
      school_id: "school-A",
      domain: "school_website",
      version: 1,
      value: oldPublished,
      changed_by: "admin-A",
    });
    await appendSchoolSiteVersion(store.db, "school-A", "admin-A", 1, (site) =>
      withDraft(site, { ...site.draft, title: "Nova marca escolar" }),
    );
    expect(store.rows[0]?.value.published?.title).toBe("Colégio Esperança");
    expect(store.rows[1]?.value.published?.title).toBe("Colégio Esperança");
    expect(store.rows[1]?.value.draft.title).toBe("Nova marca escolar");
  });

  it("rejeita versões antigas e não sobrescreve a outra sessão", async () => {
    const store = database();
    await appendSchoolSiteVersion(store.db, "school-A", "admin-A", 0, (s) => s);
    await expect(
      appendSchoolSiteVersion(store.db, "school-A", "admin-B", 0, (s) => s),
    ).rejects.toThrow("Recarregue");
    expect(store.rows).toHaveLength(1);
  });

  it("despublicação insere nova versão sem apagar a anterior", async () => {
    const store = database();
    await appendSchoolSiteVersion(store.db, "school-A", "admin-A", 0, (site) =>
      withPublication(site),
    );
    const nextVersion = await appendSchoolSiteVersion(
      store.db, "school-A", "admin-A", 1, (site) => withoutPublication(site),
    );
    expect(nextVersion).toBe(2);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[0]?.value.published).not.toBeNull();
    expect(store.rows[1]?.value.published).toBeNull();
    expect(store.rows[1]?.value.draft).toEqual(store.rows[0]?.value.draft);
  });

  it("mantém as versões separadas de cada escola", async () => {
    const store = database();
    await appendSchoolSiteVersion(store.db, "school-A", "admin-A", 0, (s) => s);
    await appendSchoolSiteVersion(store.db, "school-B", "admin-B", 0, (s) => s);
    const a = await latestSchoolSiteRow(store.db, "school-A");
    const b = await latestSchoolSiteRow(store.db, "school-B");
    expect(a?.version).toBe(1);
    expect(b?.version).toBe(1);
    // O leitor privado projecta apenas id/version/value; o teste confirma
    // o filtro escolar através das linhas guardadas, não expõe school_id.
    expect(store.rows.filter((row) => row.school_id === "school-A")).toHaveLength(1);
    expect(store.rows.filter((row) => row.school_id === "school-B")).toHaveLength(1);
  });
});
