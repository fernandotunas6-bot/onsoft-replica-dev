import "./lib/error-capture";

import { AsyncLocalStorage } from "node:async_hooks";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { CSP_REPORT_PATH, handleCspReport } from "./lib/csp";
import { withSecurityHeaders } from "./lib/security-headers";
import { installKeepAlive, installRequestIdSource } from "./lib/execution-context";
import { REQUEST_ID_HEADER, acceptRequestId, newRequestId } from "./lib/request-id";

type ExecutionContext = { waitUntil?: (promise: Promise<unknown>) => void };
type RequestStore = { ctx: ExecutionContext; requestId: string };

// `ctx` do pedido em curso, para `keepAlive` (alertas) o encontrar sem o passar à mão,
// e o ID de correlação, para os logs e a auditoria o levarem.
const requestContext = new AsyncLocalStorage<RequestStore>();
installKeepAlive((promise) => requestContext.getStore()?.ctx.waitUntil?.(promise));
installRequestIdSource(() => requestContext.getStore()?.requestId);

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = acceptRequestId(request.headers.get(REQUEST_ID_HEADER)) ?? newRequestId();
    const store = { ctx: (ctx ?? {}) as ExecutionContext, requestId };
    const response = await requestContext.run(store, () => handle(request, env, ctx));
    return withRequestId(response, requestId);
  },
};

/** Devolve o ID ao browser: a referência que o suporte procura nos logs. */
function withRequestId(response: Response, requestId: string): Response {
  if (response.status === 101) return response;
  try {
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    // Cabeçalhos imutáveis (resposta vinda de fetch): copiar.
    const copy = new Response(response.body, response);
    copy.headers.set("x-request-id", requestId);
    return copy;
  }
}

async function handle(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || /^\/(?:site|escolas|blog)(?:\/|$)/.test(pathname)) {
      const { handleSchoolWebsite } = await import("@/features/school-website/site-http");
      const website = await handleSchoolWebsite(request);
      if (website) return withSecurityHeaders(website);
    }
    if (new URL(request.url).pathname === CSP_REPORT_PATH) {
      return withSecurityHeaders(await handleCspReport(request));
    }
    const handler = await getServerEntry();
    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
  } catch (error) {
    console.error(error);
    return withSecurityHeaders(
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
}
