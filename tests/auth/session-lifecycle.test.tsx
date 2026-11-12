// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, useAuthSession } from "@/components/auth/AuthGate";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  pendingMfaFactors: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/features/auth/pending-mfa", () => ({ pendingMfaFactors: auth.pendingMfaFactors }));
vi.mock("@/components/auth/AuthBackgroundVideo", () => ({ AuthBackgroundVideo: () => null }));
vi.mock("@/components/auth/AuthHeroSlides", () => ({ AuthHeroSlides: () => null }));
vi.mock("@/components/auth/AuthCaptcha", () => ({ AuthCaptcha: () => null }));
vi.mock("@/components/auth/StepUpDialog", () => ({ StepUpDialog: () => null }));

function session(id: string) {
  return {
    user: { id, email: `${id}@example.test`, user_metadata: {}, app_metadata: {} },
    access_token: "test",
  };
}
type FakeSession = ReturnType<typeof session>;
let onAuth: (event: string, next: FakeSession | null) => void;
let queryClient: QueryClient;
function Probe() {
  return <div>Conta {useAuthSession()?.user.id}</div>;
}
function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthGate sessionHint={false}>
        <Probe />
      </AuthGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.pendingMfaFactors.mockResolvedValue(null);
  auth.onAuthStateChange.mockImplementation((callback) => {
    onAuth = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("sessão, cache e respostas atrasadas", () => {
  it("um fim de sessão externo limpa as consultas da pessoa anterior", async () => {
    mount();
    act(() => onAuth("SIGNED_IN", session("ana")));
    await screen.findByText("Conta ana");
    queryClient.setQueryData(["finance", "invoices"], [{ id: "privado-ana" }]);

    act(() => onAuth("SIGNED_OUT", null));

    expect(queryClient.getQueryData(["finance", "invoices"])).toBeUndefined();
  });

  it("a entrada de outra pessoa não reutiliza dados de consultas sem userId", async () => {
    mount();
    act(() => onAuth("SIGNED_IN", session("ana")));
    await screen.findByText("Conta ana");
    queryClient.setQueryData(["pedagogical-workspace"], { students: ["aluno de Ana"] });

    act(() => onAuth("SIGNED_IN", session("bruno")));
    await screen.findByText("Conta bruno");

    expect(queryClient.getQueryData(["pedagogical-workspace"])).toBeUndefined();
  });

  it("uma confirmação MFA atrasada não reabre uma sessão terminada", async () => {
    mount();
    let finish!: (value: null) => void;
    auth.pendingMfaFactors.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    act(() => onAuth("SIGNED_IN", session("ana")));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() => onAuth("SIGNED_OUT", null));
    await act(async () => finish(null));

    expect(screen.queryByText("Conta ana")).toBeNull();
    expect(screen.getByRole("heading", { name: "Iniciar sessão" })).toBeTruthy();
  });

  it("renovar o token da mesma pessoa conserva a cache", async () => {
    mount();
    act(() => onAuth("SIGNED_IN", session("ana")));
    await screen.findByText("Conta ana");
    queryClient.setQueryData(["pedagogical-workspace"], { ok: true });

    act(() => onAuth("TOKEN_REFRESHED", session("ana")));
    await screen.findByText("Conta ana");

    expect(queryClient.getQueryData(["pedagogical-workspace"])).toEqual({ ok: true });
  });

  it("uma leitura pendente não repõe a cache depois do fim da sessão", async () => {
    mount();
    act(() => onAuth("SIGNED_IN", session("ana")));
    await screen.findByText("Conta ana");
    let finish!: (value: unknown) => void;
    const pending = queryClient
      .fetchQuery({
        queryKey: ["finance", "invoices"],
        queryFn: () =>
          new Promise((done) => {
            finish = done;
          }),
      })
      .catch(() => undefined);

    act(() => onAuth("SIGNED_OUT", null));
    await act(async () => {
      finish([{ id: "privado-ana" }]);
      await pending;
    });

    expect(queryClient.getQueryData(["finance", "invoices"])).toBeUndefined();
  });
});
