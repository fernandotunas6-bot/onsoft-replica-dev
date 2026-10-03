import { afterEach, describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient, onlineManager } from "@tanstack/react-query";
import { pausedWriteCount, pendingWriteCount, writesLabel } from "@/lib/pending-writes";

describe("gravações à espera de rede", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("sem rede ficam em pausa (contadas) e seguem sozinhas quando a rede volta", async () => {
    const client = new QueryClient();
    // No SIGA é o QueryClientProvider que monta: é isso que retoma as pausadas.
    client.mount();
    const save = vi.fn(async (value: string) => value);
    onlineManager.setOnline(false);

    const first = new MutationObserver(client, { mutationFn: save });
    const second = new MutationObserver(client, { mutationFn: save });
    const results = Promise.all([first.mutate("nota 14"), second.mutate("falta")]);

    await vi.waitFor(() => expect(pausedWriteCount(client)).toBe(2));
    expect(pendingWriteCount(client)).toBe(2);
    expect(save).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    await expect(results).resolves.toEqual(["nota 14", "falta"]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(pausedWriteCount(client)).toBe(0);
    expect(pendingWriteCount(client)).toBe(0);
    client.unmount();
  });

  it("com rede não há nada à espera", async () => {
    const client = new QueryClient();
    await new MutationObserver(client, { mutationFn: async () => "ok" }).mutate();
    expect(pausedWriteCount(client)).toBe(0);
  });

  it("texto no singular e no plural", () => {
    expect(writesLabel(1)).toBe("1 alteração");
    expect(writesLabel(3)).toBe("3 alterações");
  });
});
