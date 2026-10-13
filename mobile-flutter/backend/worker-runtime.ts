export type Handler = (request: Request) => Promise<Response>;
export type WorkerHandlers = { canonical: Handler; extension: Handler; assets: Handler };
/** Router boundary used by the staging Worker; no database/provider simulation. */
export async function routeMobileRequest(request: Request, handlers: WorkerHandlers) {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    ) {
      return Response.json(
        { error: "ORIGIN_FORBIDDEN" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    try {
      let response: Response;
      if (/^\/api\/mobile-v4\/schools\/[^/]+\/(?:classes|tasks)(?:\/[^/]+)?$/.test(url.pathname)) {
        response = await handlers.extension(request);
      } else if (url.pathname.startsWith("/api/mobile-v4/")) {
        response = await handlers.canonical(request);
      } else {
        response = Response.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("Vary", "Authorization, Origin");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.delete("Set-Cookie");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return Response.json(
        { error: "SERVICE_UNAVAILABLE" },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
        },
      );
    }
  }
  return handlers.assets(request);
}
