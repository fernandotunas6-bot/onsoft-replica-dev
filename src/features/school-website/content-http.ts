import { publicWebsiteContent, websiteOrigin, type WebsiteState } from "./content-model";

export function createWebsiteContentHandler(
  load: (code: string) => Promise<{
    state: WebsiteState;
    programNames: Record<string, string | null>;
    campaignOpen?: boolean;
  } | null>,
) {
  return async (request: Request, code: string) => {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(code)) return reply(400, { error: "invalid_school" });
    if (!["GET", "OPTIONS"].includes(request.method))
      return reply(405, { error: "method_not_allowed" });
    try {
      const loaded = await load(code);
      const state = loaded?.state;
      if (!state?.published) return reply(404, { error: "website_not_published" });
      const origin = request.headers.get("origin");
      if (
        origin &&
        origin !== new URL(request.url).origin &&
        origin !== websiteOrigin(state.published.content.websiteUrl)
      )
        return reply(403, { error: "origin_not_allowed" });
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      }
      if (request.method === "OPTIONS")
        return origin ? reply(204) : reply(403, { error: "origin_required" });
      const content = publicWebsiteContent(state);
      if (!content) return reply(404, { error: "website_not_published" });
      const values = { ...content.values };
      const unavailablePrograms: string[] = [];
      for (const [key, name] of Object.entries(loaded!.programNames)) {
        if (name === null) unavailablePrograms.push(key);
        else values[key] = name;
      }
      const campaign = state.published.content.campaignSlug;
      return reply(200, {
        ...content,
        values,
        unavailablePrograms,
        admissions: campaign
          ? {
              isOpen: loaded!.campaignOpen === true,
              path: loaded!.campaignOpen ? `/matricula/${encodeURIComponent(campaign)}` : null,
            }
          : null,
      });
    } catch {
      return reply(503, { error: "website_unavailable" });
    }
  };
}
