import { requestContext } from "./request-context";
import { handleMobileV4Http } from "../../src/features/mobile-v4/http.server";

// Deployed only to the isolated Pages preview. Binding secrets are supplied by
// the runtime (nodejs_compat), never bundled into source or browser assets.
export default {
  async fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/mobile-v4/"))
      return requestContext.run(request, () => handleMobileV4Http(request));
    if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
      return Response.json(
        { error: "NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    return env.ASSETS.fetch(request);
  },
};
