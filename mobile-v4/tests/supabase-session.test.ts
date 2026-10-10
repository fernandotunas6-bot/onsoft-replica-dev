import { describe, expect, it, vi } from "vitest";
import {
  supabaseSessionTransport,
  type SupabaseSessionClient,
} from "../src/services/supabase-session";
import { ApiGateway } from "../src/services/api";

function clientFixture() {
  let token = "first-token";
  let listener: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const unsubscribe = vi.fn();
  const client: SupabaseSessionClient = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: token, user: { id: "user-a" } } },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
  return {
    client,
    unsubscribe,
    rotate: (value: string) => {
      token = value;
    },
    emit: (event: string, user: string | null) =>
      listener(event, user ? { user: { id: user } } : null),
  };
}
describe("existing Supabase session connector", () => {
  it("reads the SDK each time and sends its latest token to the same-origin session endpoint", async () => {
    const f = clientFixture();
    const transport = supabaseSessionTransport(f.client);
    const requests: string[] = [];
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      requests.push(new Headers(init?.headers).get("Authorization")!);
      return Response.json({ userId: "user-a", name: "Real API name", memberships: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const gateway = new ApiGateway("/api/mobile-v4", transport);
      await gateway.session();
      f.rotate("renewed-token");
      await gateway.session();
      expect(requests).toEqual(["Bearer first-token", "Bearer renewed-token"]);
      expect(fetcher.mock.calls.every(([url]) => url === "/api/mobile-v4/session")).toBe(true);
      expect(f.client.auth.getSession).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not convert SDK errors to an anonymous/empty session", async () => {
    const f = clientFixture();
    f.client.auth.getSession = async () => ({
      data: { session: null },
      error: new Error("private SDK detail"),
    });
    await expect(supabaseSessionTransport(f.client).accessToken()).rejects.toThrow(
      "Não foi possível obter a sessão Supabase.",
    );
  });
  it("returns no bearer when signed out", async () => {
    const f = clientFixture();
    f.client.auth.getSession = async () => ({ data: { session: null }, error: null });
    expect(await supabaseSessionTransport(f.client).accessToken()).toBeNull();
  });
  it("keeps same-user refresh/focus stable but resets on account change, logout and MFA", async () => {
    const f = clientFixture();
    const changed = vi.fn();
    const stop = supabaseSessionTransport(f.client).subscribeSessionChanged!(changed);
    f.emit("INITIAL_SESSION", "user-a");
    f.emit("SIGNED_IN", "user-a");
    f.emit("TOKEN_REFRESHED", "user-a");
    expect(changed).not.toHaveBeenCalled();
    f.emit("TOKEN_REFRESHED", "user-b");
    f.emit("MFA_CHALLENGE_VERIFIED", "user-b");
    f.emit("USER_UPDATED", "user-b");
    f.emit("SIGNED_OUT", null);
    expect(changed).toHaveBeenCalledTimes(4);
    stop();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("uses local signout and reports an SDK failure", async () => {
    const f = clientFixture();
    const transport = supabaseSessionTransport(f.client);
    await transport.clearSession!();
    expect(f.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    f.client.auth.signOut = async () => ({ error: new Error("private SDK detail") });
    await expect(transport.clearSession!()).rejects.toThrow(
      "Não foi possível terminar a sessão Supabase.",
    );
  });
  it("rejects a late session HTTP response after an account switch instead of restoring old authority", async () => {
    const f = clientFixture();
    const gateway = new ApiGateway("/api/mobile-v4", supabaseSessionTransport(f.client));
    const changed = vi.fn();
    const stop = gateway.subscribeSessionChanged(changed);
    f.emit("INITIAL_SESSION", "user-a");
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            finish = r;
          }),
      ),
    );
    try {
      const pending = gateway.session();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      f.emit("SIGNED_IN", "user-b");
      finish(Response.json({ userId: "user-a", name: "Old account", memberships: [] }));
      await expect(pending).rejects.toThrow("A sessão foi alterada");
      expect(changed).toHaveBeenCalledOnce();
      await expect(
        gateway.academicCatalog({ userId: "user-a", schoolId: "school-a", role: "professor" }),
      ).rejects.toThrow();
    } finally {
      stop();
      vi.unstubAllGlobals();
    }
  });
});
