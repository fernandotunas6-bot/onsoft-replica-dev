// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ACTIVE_SCHOOL_CHANGED_EVENT } from "@/features/auth/active-school";
import { TenantProvider, useTenant } from "@/features/saas/tenant-context";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/features/saas/server", () => ({
  getTenantBySlug: lookup,
  getTenantByHostname: lookup,
  getTenantForCurrentUser: vi.fn(async () => null),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const tenant = (id: string) => ({
  id,
  slug: id,
  name: id,
  status: "active",
  subscription_status: "active",
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <TenantProvider>{children}</TenantProvider>
);

beforeEach(() => {
  lookup.mockReset();
});
afterEach(cleanup);

describe("contexto institucional perante respostas fora de ordem", () => {
  it("descarta uma leitura antiga que termina depois da nova escola", async () => {
    const old = deferred<ReturnType<typeof tenant>>();
    lookup.mockReturnValueOnce(old.promise).mockResolvedValueOnce(tenant("escola-b"));
    const { result } = renderHook(() => useTenant(), { wrapper });
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event(ACTIVE_SCHOOL_CHANGED_EVENT)));
    await waitFor(() => expect(result.current.activeTenant?.id).toBe("escola-b"));
    await act(async () => old.resolve(tenant("escola-a")));

    expect(result.current.activeTenant?.id).toBe("escola-b");
  });

  it("uma leitura antiga não termina o indicador de carregamento da nova", async () => {
    const old = deferred<ReturnType<typeof tenant>>();
    const next = deferred<ReturnType<typeof tenant>>();
    lookup.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => useTenant(), { wrapper });
    act(() => window.dispatchEvent(new Event(ACTIVE_SCHOOL_CHANGED_EVENT)));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));

    await act(async () => old.resolve(tenant("escola-a")));
    expect(result.current.isLoadingTenant).toBe(true);
    expect(result.current.activeTenant).toBeNull();
    await act(async () => next.resolve(tenant("escola-b")));
    expect(result.current.isLoadingTenant).toBe(false);
    expect(result.current.activeTenant?.id).toBe("escola-b");
  });

  it("limpa marca e plano anteriores enquanto o contexto seguinte é confirmado", async () => {
    lookup.mockResolvedValueOnce(tenant("escola-a"));
    const { result } = renderHook(() => useTenant(), { wrapper });
    await waitFor(() => expect(result.current.activeTenant?.id).toBe("escola-a"));
    const next = deferred<ReturnType<typeof tenant>>();
    lookup.mockReturnValueOnce(next.promise);

    act(() => window.dispatchEvent(new Event(ACTIVE_SCHOOL_CHANGED_EVENT)));
    expect(result.current.activeTenant).toBeNull();
    expect(result.current.activePlan).toBeNull();
    await act(async () => next.resolve(tenant("escola-b")));
  });
});
