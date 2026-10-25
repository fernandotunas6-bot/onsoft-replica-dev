// @vitest-environment jsdom
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  offlineQueriesStorageKey,
  persistOfflineQueries,
  restoreOfflineQueries,
} from "@/lib/offline/offline-queries";

describe("cache offline institucional por escola", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("recusa cache antiga sem escola em vez de a aplicar noutra instituição", () => {
    const source = new QueryClient();
    source.setQueryData(["school", "settings"], { school_name: "Instituição A" });
    localStorage.setItem(
      offlineQueriesStorageKey(null),
      JSON.stringify({ savedAt: Date.now(), state: dehydrate(source) }),
    );
    const destination = new QueryClient();
    expect(restoreOfflineQueries(destination, null)).toBe(false);
    expect(destination.getQueryData(["school", "settings"])).toBeUndefined();
  });

  it("não guarda dados da escola A na chave B após troca de contexto", async () => {
    const client = new QueryClient();
    let activeSchool = "school-a";
    const stop = persistOfflineQueries(client, () => activeSchool);
    client.setQueryData(["school", "settings"], { school_name: "Instituição A" });
    activeSchool = "school-b";
    await vi.advanceTimersByTimeAsync(1000);
    expect(localStorage.getItem(offlineQueriesStorageKey("school-b"))).toBeNull();
    expect(localStorage.getItem(offlineQueriesStorageKey("school-a"))).toBeNull();
    stop();
  });

  it("guarda somente consultas institucionais quando a escola permanece igual", async () => {
    const client = new QueryClient();
    const stop = persistOfflineQueries(client, () => "school-a");
    client.setQueryData(["school", "settings"], { school_name: "Instituição A" });
    client.setQueryData(["students", "names"], ["Dado pessoal não deve persistir"]);
    await vi.advanceTimersByTimeAsync(1000);
    const raw = localStorage.getItem(offlineQueriesStorageKey("school-a"));
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw!) as { state: { queries: Array<{ queryKey: string[] }> } };
    expect(state.state.queries.map((query) => query.queryKey)).toEqual([["school", "settings"]]);
    stop();
  });
});
