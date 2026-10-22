// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MutationObserver,
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { OfflineBanner } from "@/components/mobile/OfflineBanner";

const setNetwork = (online: boolean) =>
  act(() => {
    onlineManager.setOnline(online);
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });

describe("aviso de ligação com gravações à espera", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
    vi.useRealTimers();
  });

  it("conta as gravações à espera, mostra o envio e confirma", async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    setNetwork(false);
    expect(screen.getByRole("status").textContent).toContain("Sem ligação");

    let finish: (value: string) => void = () => {};
    const save = () => new Promise<string>((resolve) => (finish = resolve));
    act(() => {
      void new MutationObserver(client, { mutationFn: save }).mutate();
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("status").textContent).toContain("1 alteração à espera");

    setNetwork(true);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("status").textContent).toContain("A enviar 1 alteração");

    act(() => finish("ok"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("status").textContent).toContain("Alterações enviadas.");
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(screen.getByRole("status").textContent).toContain("Alterações enviadas.");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("fechar com gravações por enviar pede confirmação", async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
    setNetwork(false);
    act(() => {
      void new MutationObserver(client, {
        mutationFn: () => new Promise<string>(() => {}),
      }).mutate();
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("status").textContent).toContain("à espera");

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
