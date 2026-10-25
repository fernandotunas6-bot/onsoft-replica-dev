// @vitest-environment jsdom
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOfflineQueries,
  isOfflineQueryKey,
  offlineQueriesStorageKey,
  persistOfflineQueries,
  restoreOfflineQueries,
} from "@/lib/offline/offline-queries";

const years = [
  { id: "year-a", code: "2026", name: "2026", status: "active" },
];
const terms = [
  {
    id: "term-a",
    name: "1.º Período",
    sequence: 1,
    starts_on: "2026-09-01",
    ends_on: "2026-12-01",
    academic_year_id: "year-a",
  },
];

describe("cache offline mínima por escola", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("não inclui configurações bancárias, calendário nem chaves compostas", () => {
    expect(isOfflineQueryKey(["school", "academic-years"])).toBe(true);
    expect(isOfflineQueryKey(["school", "academic-terms"])).toBe(true);
    expect(isOfflineQueryKey(["school", "settings"])).toBe(false);
    expect(isOfflineQueryKey(["calendar", "events"])).toBe(false);
    expect(isOfflineQueryKey(["academic", "rooms"])).toBe(false);
    expect(isOfflineQueryKey(["school", "academic-years", "private"])).toBe(false);
  });

  it("remove o formato antigo, que continha configurações escolares completas", () => {
    const oldSource = new QueryClient();
    oldSource.setQueryData(["school", "settings"], {
      name: "Instituição A",
      banking: { iban: "AO987654321", bank_name: "Banco interno" },
      agt: { invoice_series: "FACT" },
    });
    const oldKey = "siga:offline-queries:v1:school-a";
    localStorage.setItem(
      oldKey,
      JSON.stringify({ savedAt: Date.now(), state: dehydrate(oldSource) }),
    );
    const current = new QueryClient();
    expect(restoreOfflineQueries(current, "school-a")).toBe(false);
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(current.getQueryData(["school", "settings"])).toBeUndefined();
  });

  it("não grava dados pessoais ou fiscais nem chaves extras nas linhas", async () => {
    const client = new QueryClient();
    const stop = persistOfflineQueries(client, () => "school-a");
    client.setQueryData(["school", "settings"], {
      name: "Instituição A",
      banking: { iban: "AO987654321" },
    });
    client.setQueryData(["calendar", "events"], [{ description: "Segredo do aluno" }]);
    client.setQueryData(["school", "academic-years"], [
      { ...years[0], internalNotes: "Só o director", school_id: "tenant-a" },
    ]);
    client.setQueryData(["school", "academic-terms"], [
      { ...terms[0], individualStudent: "Aluno privado" },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    const raw = localStorage.getItem(offlineQueriesStorageKey("school-a"));
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("iban");
    expect(raw).not.toContain("description");
    expect(raw).not.toContain("internalNotes");
    expect(raw).not.toContain("individualStudent");
    expect(JSON.parse(raw!)).toEqual({
      version: 2,
      savedAt: Date.now(),
      years,
      terms,
    });
    stop();
  });

  it("não guarda a cache da escola anterior após mudança de contexto", async () => {
    const client = new QueryClient();
    let school = "school-a";
    const stop = persistOfflineQueries(client, () => school);
    client.setQueryData(["school", "academic-years"], years);
    school = "school-b";
    await vi.advanceTimersByTimeAsync(1000);
    expect(localStorage.getItem(offlineQueriesStorageKey("school-b"))).toBeNull();
    expect(localStorage.getItem(offlineQueriesStorageKey("school-a"))).toBeNull();
    stop();
  });

  it("repõe somente arrays académicos reconhecidos", async () => {
    const source = new QueryClient();
    const stop = persistOfflineQueries(source, () => "school-a");
    source.setQueryData(["school", "academic-years"], years);
    source.setQueryData(["school", "academic-terms"], terms);
    await vi.advanceTimersByTimeAsync(1000);
    const destination = new QueryClient();
    expect(restoreOfflineQueries(destination, "school-a")).toBe(true);
    expect(destination.getQueryData(["school", "academic-years"])).toEqual(years);
    expect(destination.getQueryData(["school", "academic-terms"])).toEqual(terms);
    expect(destination.getQueryData(["school", "settings"])).toBeUndefined();
    stop();
  });

  it("recusa dados falsificados, vencidos ou sem escola activa", () => {
    const key = offlineQueriesStorageKey("school-a");
    const fake = { version: 2, savedAt: Date.now(), years: [{ secret: "inject" }] };
    localStorage.setItem(key, JSON.stringify(fake));
    const client = new QueryClient();
    expect(restoreOfflineQueries(client, "school-a")).toBe(false);
    expect(client.getQueryData(["school", "academic-years"])).toBeUndefined();
    expect(restoreOfflineQueries(client, null)).toBe(false);
    localStorage.setItem(
      key,
      JSON.stringify({ version: 2, savedAt: Date.now() - 31 * 86_400_000, years }),
    );
    expect(restoreOfflineQueries(client, "school-a")).toBe(false);
  });

  it("ao terminar sessão elimina cópias antigas e actuais", () => {
    localStorage.setItem("siga:offline-queries:v1:school-a", "old");
    localStorage.setItem(offlineQueriesStorageKey("school-a"), "new");
    localStorage.setItem("unrelated", "keep");
    clearOfflineQueries();
    expect(localStorage.getItem("siga:offline-queries:v1:school-a")).toBeNull();
    expect(localStorage.getItem(offlineQueriesStorageKey("school-a"))).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});
