// Public Pages preview: never proxy institutional credentials or school data.
// The authenticated backend lives in the isolated SIGA server, not this shell.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "INSTITUTIONAL_API_DISABLED" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return env.ASSETS.fetch(request);
  },
};
