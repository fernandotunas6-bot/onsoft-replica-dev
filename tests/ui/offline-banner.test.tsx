// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
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
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1 alteração à espera"),
    );

    setNetwork(true);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("A enviar 1 alteração"),
    );

    act(() => finish("ok"));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Alterações enviadas."),
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 4000 });
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
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("à espera"));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
