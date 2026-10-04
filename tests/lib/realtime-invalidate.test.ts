import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { realtimeInvalidator } from "@/lib/realtime-invalidate";

function fakeClient() {
  const invalidateQueries = vi.fn(() => Promise.resolve());
  return { client: { invalidateQueries } as unknown as QueryClient, invalidateQueries };
}

describe("realtimeInvalidator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uma rajada (importação de 500 alunos) dá uma invalidação por chave", () => {
    const { client, invalidateQueries } = fakeClient();
    const realtime = realtimeInvalidator(client);
    for (let i = 0; i < 500; i++) {
      realtime.invalidate(["students", "search"], ["dashboard", "overview"]);
    }
    expect(invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["students", "search"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard", "overview"] });
  });

  it("uma rajada longa actualiza a cada janela, não só no fim", () => {
    const { client, invalidateQueries } = fakeClient();
    const realtime = realtimeInvalidator(client);
    for (let ms = 0; ms < 1000; ms += 10) {
      realtime.invalidate(["finance", "invoices"]);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(300);
    expect(invalidateQueries.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(invalidateQueries.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("ao sair do ecrã não invalida o que ficou pendente", () => {
    const { client, invalidateQueries } = fakeClient();
    const realtime = realtimeInvalidator(client);
    realtime.invalidate(["dashboard", "overview"]);
    realtime.dispose();
    vi.advanceTimersByTime(1000);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
