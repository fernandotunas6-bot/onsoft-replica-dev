import { beforeEach, describe, expect, it, vi } from "vitest";

// O `beforeEach` abaixo chama `vi.resetModules()` — necessário, porque estes
// testes mexem em `process.env` e precisam do módulo recarregado. O efeito é que
// cada teste reimporta o middleware e o `@supabase/supabase-js` de raiz, e sob
// carga isso passa do limite de 5000 ms por omissão: o primeiro teste do ficheiro
// já foi observado a levar 5943 ms e a falhar, enquanto isolado leva 4108 ms.
//
// Um teste de segurança intermitente é pior do que nenhum: fica vermelho ao
// acaso, deixa de ser lido, e a falha a sério passa despercebida no meio do
// ruído. O limite alargado reflecte o custo real do desenho do ficheiro.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Testes do guarda de autenticação (`requireSupabaseAuth`).
 *
 * Este middleware é o ponto mais crítico do sistema: tudo o que passa por ele
 * corre depois com `supabaseAdmin` (service_role, que ignora RLS). Até aqui
 * não tinha um único teste — e teve durante algum tempo um fallback que
 * descodificava o JWT sem verificar a assinatura, o que permitia a qualquer
 * pessoa forjar um token com um `sub` arbitrário e ser aceite como esse
 * utilizador. Estes testes fixam as duas barreiras que fecham esse buraco:
 *
 *  1. Se o Auth API RESPONDEU (mesmo que a recusar), nunca se cai no
 *     fallback local — recusa e pronto.
 *  2. Se o Auth API está genuinamente inacessível, o fallback só aceita o
 *     token depois de verificar a assinatura HMAC-SHA256.
 */

const getRequestMock = vi.fn();
const createClientMock = vi.fn();

// 2FA na sessão (session-mfa.ts): estas contas não têm factor verificado.
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { admin: { mfa: { listFactors: async () => ({ data: { factors: [] }, error: null }) } } },
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => getRequestMock(),
  setResponseHeaders: () => undefined,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const SECRET = "segredo-jwt-de-teste-com-tamanho-suficiente";

function base64url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64url");
}

/** Constrói um JWT HS256 realmente assinado com `secret`. */
async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const unsigned = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** Token com estrutura e claims válidas mas assinatura inventada. */
function forgeJwt(payload: Record<string, unknown>): string {
  const unsigned = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(payload),
  )}`;
  return `${unsigned}.assinatura-completamente-inventada`;
}

const futureExp = () => Math.floor(Date.now() / 1000) + 3600;
const pastExp = () => Math.floor(Date.now() / 1000) - 3600;

/**
 * @param authBehaviour como o Auth API da Supabase se comporta:
 *  - "rejects": responde normalmente, mas diz que o token não presta
 *  - "accepts": valida o token e devolve claims
 *  - "unreachable": lança (falha de rede no SSR)
 */
function setupRequest(token: string, authBehaviour: "rejects" | "accepts" | "unreachable") {
  getRequestMock.mockReturnValue(
    new Request("https://escola.portal-siga.com/api/x", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

  const rejected = { data: null, error: { message: "invalid JWT" } };
  const unreachable = () => {
    throw new TypeError("fetch failed");
  };

  createClientMock.mockReturnValue({
    auth: {
      getClaims:
        authBehaviour === "unreachable"
          ? vi.fn(unreachable)
          : vi
              .fn()
              .mockResolvedValue(
                authBehaviour === "accepts"
                  ? { data: { claims: { sub: "user-real", email: "real@escola.ao" } }, error: null }
                  : rejected,
              ),
      getUser:
        authBehaviour === "unreachable"
          ? vi.fn(unreachable)
          : vi
              .fn()
              .mockResolvedValue(
                authBehaviour === "accepts"
                  ? { data: { user: { id: "user-real", email: "real@escola.ao" } }, error: null }
                  : { data: { user: null }, error: { message: "invalid JWT" } },
              ),
    },
  });
}

type MiddlewareHandler = (args: { next: (arg: unknown) => Promise<unknown> }) => Promise<unknown>;

async function runMiddleware() {
  const { requireSupabaseAuth } = await import("@/integrations/supabase/auth-middleware");
  const next = vi.fn(async (arg: unknown) => arg);
  const handler = (requireSupabaseAuth as unknown as { options: { server: MiddlewareHandler } })
    .options.server;
  const result = await handler({ next });
  return { next, result };
}

describe("requireSupabaseAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestMock.mockReset();
    createClientMock.mockReset();
    process.env["SUPABASE_URL"] = "https://projecto.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_chave_de_teste";
    delete process.env["SUPABASE_JWT_SECRET"];
  });

  describe("quando o Auth API responde (está acessível)", () => {
    it("aceita um token que o Auth API validou", async () => {
      const token = await signJwt({ sub: "user-real", exp: futureExp() }, SECRET);
      setupRequest(token, "accepts");

      const { next } = await runMiddleware();

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ context: { userId: "user-real" } });
    });

    it("REJEITA um token forjado — nunca cai no fallback local", async () => {
      // Regressão da vulnerabilidade: `sub`/`exp` bem formados, assinatura
      // inventada. O Auth API recusa; o fallback não pode salvar o token.
      const token = forgeJwt({ sub: "admin-de-outra-escola", exp: futureExp() });
      setupRequest(token, "rejects");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });

    it("rejeita o token forjado mesmo com SUPABASE_JWT_SECRET configurado", async () => {
      // O segredo existir não pode reabrir o caminho: se o Auth API respondeu
      // e recusou, a decisão dele é final.
      process.env["SUPABASE_JWT_SECRET"] = SECRET;
      const token = await signJwt({ sub: "user-real", exp: futureExp() }, SECRET);
      setupRequest(token, "rejects");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });
  });

  describe("quando o Auth API está inacessível (falha de rede no SSR)", () => {
    it("falha fechado se SUPABASE_JWT_SECRET não estiver configurado", async () => {
      const token = await signJwt({ sub: "user-real", exp: futureExp() }, SECRET);
      setupRequest(token, "unreachable");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });

    it("aceita um token com assinatura HMAC válida", async () => {
      process.env["SUPABASE_JWT_SECRET"] = SECRET;
      const token = await signJwt({ sub: "user-real", exp: futureExp() }, SECRET);
      setupRequest(token, "unreachable");

      const { next } = await runMiddleware();

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ context: { userId: "user-real" } });
    });

    it("REJEITA um token forjado (assinatura inválida)", async () => {
      process.env["SUPABASE_JWT_SECRET"] = SECRET;
      const token = forgeJwt({ sub: "admin-de-outra-escola", exp: futureExp() });
      setupRequest(token, "unreachable");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });

    it("REJEITA um token assinado com outro segredo", async () => {
      process.env["SUPABASE_JWT_SECRET"] = SECRET;
      const token = await signJwt({ sub: "user-real", exp: futureExp() }, "outro-segredo-qualquer");
      setupRequest(token, "unreachable");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });

    it("REJEITA um token bem assinado mas expirado", async () => {
      process.env["SUPABASE_JWT_SECRET"] = SECRET;
      const token = await signJwt({ sub: "user-real", exp: pastExp() }, SECRET);
      setupRequest(token, "unreachable");

      await expect(runMiddleware()).rejects.toThrow(/Unauthorized/i);
    });
  });

  describe("higiene do cabeçalho Authorization", () => {
    it("rejeita pedido sem cabeçalho", async () => {
      getRequestMock.mockReturnValue(new Request("https://escola.portal-siga.com/api/x"));
      createClientMock.mockReturnValue({ auth: {} });

      await expect(runMiddleware()).rejects.toThrow(/sessão em falta/i);
    });

    it("rejeita um esquema que não seja Bearer", async () => {
      getRequestMock.mockReturnValue(
        new Request("https://escola.portal-siga.com/api/x", {
          headers: { authorization: "Basic YWRtaW46YWRtaW4=" },
        }),
      );
      createClientMock.mockReturnValue({ auth: {} });

      await expect(runMiddleware()).rejects.toThrow(/Authorization inválido/i);
    });

    it("rejeita algo que não tem a forma de um JWT", async () => {
      getRequestMock.mockReturnValue(
        new Request("https://escola.portal-siga.com/api/x", {
          headers: { authorization: "Bearer nao-e-um-jwt" },
        }),
      );
      createClientMock.mockReturnValue({ auth: {} });

      await expect(runMiddleware()).rejects.toThrow(/JWT inválido/i);
    });
  });
});
