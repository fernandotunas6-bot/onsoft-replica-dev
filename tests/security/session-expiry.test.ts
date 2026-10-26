import { describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { sessionIsGone } from "@/lib/session-expiry";

const session = { access_token: "a.b.c", refresh_token: "r" };
const offline = () => new AuthRetryableFetchError("Failed to fetch", 0);
const refused = (message: string, status: number) => new AuthApiError(message, status, undefined);

function auth({
  getSession = { data: { session }, error: null } as unknown,
  getUser = { data: { user: { id: "u" } }, error: null } as unknown,
  refreshSession = { data: { session }, error: null } as unknown,
} = {}) {
  return {
    getSession: vi.fn().mockResolvedValue(getSession),
    getUser: vi.fn().mockResolvedValue(getUser),
    refreshSession: vi.fn().mockResolvedValue(refreshSession),
  } as unknown as NonNullable<Parameters<typeof sessionIsGone>[0]>;
}

describe("um 401 só termina a sessão se o Auth a recusar", () => {
  it("sessão válida: fica", async () => {
    expect(await sessionIsGone(auth())).toBe(false);
  });

  it("sem rede ao confirmar (computador a acordar): fica", async () => {
    expect(await sessionIsGone(auth({ getUser: { data: { user: null }, error: offline() } }))).toBe(
      false,
    );
    expect(
      await sessionIsGone(auth({ getSession: { data: { session: null }, error: offline() } })),
    ).toBe(false);
  });

  it("token caducado mas renovável: fica", async () => {
    const client = auth({ getUser: { data: { user: null }, error: refused("invalid JWT", 401) } });
    expect(await sessionIsGone(client)).toBe(false);
    expect(client.refreshSession).toHaveBeenCalled();
  });

  it("renovação sem rede: fica", async () => {
    const client = auth({
      getUser: { data: { user: null }, error: refused("invalid JWT", 401) },
      refreshSession: { data: { session: null }, error: offline() },
    });
    expect(await sessionIsGone(client)).toBe(false);
  });

  it("sessão revogada (senha mudada, terminar em todos os dispositivos): sai", async () => {
    const client = auth({
      getUser: { data: { user: null }, error: refused("Session not found", 403) },
      refreshSession: { data: { session: null }, error: refused("Invalid Refresh Token", 400) },
    });
    expect(await sessionIsGone(client)).toBe(true);
  });

  it("sem sessão guardada: sai", async () => {
    expect(
      await sessionIsGone(auth({ getSession: { data: { session: null }, error: null } })),
    ).toBe(true);
  });
});
