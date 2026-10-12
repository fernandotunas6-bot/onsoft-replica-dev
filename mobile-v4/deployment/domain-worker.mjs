// The public domain serves a pinned, tested Pages deployment. No database secrets here.
function error(status, code) {
  return Response.json(
    { error: code },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
        Vary: "Authorization, Origin",
      },
    },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicOrigin = new URL(env.PUBLIC_ORIGIN).origin;
    const upstream = new URL(env.PAGES_ORIGIN);
    if (url.origin !== publicOrigin) return error(421, "HOST_FORBIDDEN");
    if (
      upstream.protocol !== "https:" ||
      !upstream.hostname.endsWith(".siga-plus-mobile-v4.pages.dev")
    ) {
      return error(503, "DEPLOYMENT_NOT_CONFIGURED");
    }
    const origin = request.headers.get("Origin");
    if (
      url.pathname.startsWith("/api/") &&
      ((origin && origin !== publicOrigin) ||
        request.headers.get("Sec-Fetch-Site") === "cross-site")
    ) {
      return error(403, "ORIGIN_FORBIDDEN");
    }
    const target = new URL(upstream.origin);
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers(request.headers);
    // Do not forward cookies belonging to the parent portal or trust proxy hints.
    for (const name of ["Cookie", "Host", "Forwarded", "X-Forwarded-Host", "X-Forwarded-Proto"])
      headers.delete(name);
    if (origin === publicOrigin) headers.set("Origin", upstream.origin);
    try {
      const response = await fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }),
        { cf: { cacheTtl: 0, cacheEverything: false } },
      );
      const out = new Headers(response.headers);
      out.delete("Set-Cookie");
      out.set("Cache-Control", "private, no-store");
      out.set("X-Robots-Tag", "noindex, nofollow");
      const location = out.get("Location");
      if (location) {
        const redirect = new URL(location, target);
        if (redirect.origin !== upstream.origin) return error(502, "UPSTREAM_REDIRECT_FORBIDDEN");
        out.set("Location", publicOrigin + redirect.pathname + redirect.search + redirect.hash);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: out,
      });
    } catch {
      return error(502, "UPSTREAM_UNAVAILABLE");
    }
  },
};
