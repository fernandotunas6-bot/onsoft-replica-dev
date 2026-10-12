import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { chunkedInClient, IN_CHUNK } from "@/integrations/supabase/chunked-in-client";

/**
 * O cliente do servidor divide os `.in(...)` longos em lotes: com ~200 uuids o URL
 * passava o tamanho máximo e o pedido falhava (muitas leituras ignoravam o erro e o
 * ecrã ficava vazio). Ensaio com o cliente supabase-js verdadeiro e um `fetch` falso.
 */
type Row = { id: string; n: number | null };
const rows: Row[] = Array.from({ length: 400 }, (_, n) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  n: n % 7 === 0 ? null : (n * 37) % 101,
}));

function fakeServer() {
  const urls: string[] = [];
  const methods: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    methods.push(init?.method ?? "GET");
    if (url.toString().length > 8000) {
      return new Response(JSON.stringify({ message: "URI Too Long" }), { status: 414 });
    }
    const filter = url.searchParams.get("id") ?? "";
    const ids = filter.startsWith("in.(") ? filter.slice(4, -1).split(",") : null;
    const matched = ids ? rows.filter((row) => ids.includes(row.id)) : rows;
    const head = init?.method === "HEAD";
    return new Response(head ? null : JSON.stringify(matched), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": `0-${matched.length - 1}/${matched.length}`,
      },
    });
  };
  const client = createClient("http://db.test", "service-key", {
    global: { fetch: fetchImpl as typeof fetch },
    auth: { persistSession: false },
  });
  return { db: chunkedInClient(client), urls, methods };
}

const allIds = rows.map((row) => row.id);

describe("chunkedInClient", () => {
  it("lista curta: um só pedido, igual ao do cliente normal", async () => {
    const { db, urls } = fakeServer();
    const { data, error } = await db.from("people").select("id, n").in("id", allIds.slice(0, 20));
    expect(error).toBeNull();
    expect(data).toHaveLength(20);
    expect(urls).toHaveLength(1);
  });

  it("lista longa: lotes, todas as linhas, e a ordem da consulta mantida", async () => {
    const { db, urls } = fakeServer();
    const { data, error } = await db
      .from("people")
      .select("id, n")
      .in("id", allIds)
      .order("n", { ascending: false })
      .order("id");
    expect(error).toBeNull();
    expect(urls.length).toBe(Math.ceil(allIds.length / IN_CHUNK));
    expect(urls.every((url) => url.length < 8000)).toBe(true);
    const got = data as Row[];
    expect(got).toHaveLength(400);
    // Decrescente com os nulos primeiro (como o Postgres), empates por id.
    const expected = [...rows].sort((a, b) => {
      if (a.n == null || b.n == null) return a.n == null ? (b.n == null ? 0 : -1) : 1;
      return b.n - a.n || a.id.localeCompare(b.id);
    });
    expect(got.map((row) => row.id).slice(0, 60)).toEqual(
      expected.map((row) => row.id).slice(0, 60),
    );
  });

  it("sem o cliente em lotes, a mesma leitura falhava", async () => {
    const urls: string[] = [];
    const client = createClient("http://db.test", "service-key", {
      global: {
        fetch: (async (input: RequestInfo | URL) => {
          urls.push(String(input));
          return new Response(JSON.stringify({ message: "URI Too Long" }), { status: 414 });
        }) as typeof fetch,
      },
      auth: { persistSession: false },
    });
    const { error } = await client.from("people").select("id").in("id", allIds);
    expect(error).not.toBeNull();
    expect(urls[0]!.length).toBeGreaterThan(8000);
  });

  it("lista longa só por repetidos: vai sem repetidos e cabe no URL", async () => {
    const { db, urls } = fakeServer();
    const ids = allIds.slice(0, 100);
    const { data, error } = await db
      .from("people")
      .select("id")
      .in("id", [...ids, ...ids, ...ids]);
    expect(error).toBeNull();
    expect(data).toHaveLength(100);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.length).toBeLessThan(8000);
  });

  it("texto volta a ordenar-se pela ordem portuguesa, não pelos códigos", async () => {
    const names = ["Zé", "Álvaro", "bruno", "Carla", "ana"];
    const people = Array.from({ length: 200 }, (_, n) => ({
      id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
      full_name: names[n % names.length],
    }));
    const client = createClient("http://db.test", "service-key", {
      global: {
        fetch: (async (input: RequestInfo | URL) => {
          const url = new URL(String(input));
          const ids = (url.searchParams.get("id") ?? "").slice(4, -1).split(",");
          return new Response(JSON.stringify(people.filter((p) => ids.includes(p.id))), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch,
      },
      auth: { persistSession: false },
    });
    const { data } = await chunkedInClient(client)
      .from("people")
      .select("id, full_name")
      .in(
        "id",
        people.map((p) => p.id),
      )
      .order("full_name");
    const order = [...new Set((data as Array<{ full_name: string }>).map((p) => p.full_name))];
    expect(order).toEqual(["Álvaro", "ana", "bruno", "Carla", "Zé"]);
  });

  it("contagem (head) soma os lotes", async () => {
    const { db, methods } = fakeServer();
    const { count, error } = await db
      .from("people")
      .select("id", { count: "exact", head: true })
      .in("id", allIds);
    expect(error).toBeNull();
    expect(count).toBe(400);
    expect(methods.every((method) => method === "HEAD")).toBe(true);
  });

  it("single, limit e escritas passam tal e qual (um pedido)", async () => {
    const { db, urls } = fakeServer();
    await db.from("people").select("id").in("id", allIds.slice(0, 5)).limit(1);
    await db.from("people").delete().in("id", allIds.slice(0, 3));
    expect(urls).toHaveLength(2);
  });

  it("um erro num lote devolve o erro, sem linhas parciais", async () => {
    let calls = 0;
    const client = createClient("http://db.test", "service-key", {
      global: {
        fetch: (async () => {
          calls += 1;
          return calls === 2
            ? new Response(JSON.stringify({ message: "timeout", code: "57014" }), { status: 500 })
            : new Response(JSON.stringify([{ id: "x" }]), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
        }) as typeof fetch,
      },
      auth: { persistSession: false },
    });
    const { data, error } = await chunkedInClient(client)
      .from("people")
      .select("id")
      .in("id", allIds);
    expect(data).toBeNull();
    expect(error?.message).toBe("timeout");
  });

  it("o cliente do servidor (loadSgaAdminClient) usa-o", () => {
    const source = readFileSync("src/integrations/supabase/sga-admin.ts", "utf8");
    expect(source).toMatch(/return chunkedInClient\(sgaClient\(supabaseAdmin\)\)/);
  });
});
