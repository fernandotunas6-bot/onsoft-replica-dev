import { blogSlugSchema, type PublicSchoolBlogPost } from "./blog-model";

type BlogScope = { schoolId: string; origins: string[] };
export function createSchoolBlogHandler(deps: {
  resolve: (code: string) => Promise<BlogScope | null>;
  posts: (
    schoolId: string,
    page: number,
    slug?: string,
  ) => Promise<{ posts: PublicSchoolBlogPost[]; total: number }>;
}) {
  return async (request: Request, code: string) => {
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(code)) return reply(400, { error: "invalid_school" });
    if (!["GET", "OPTIONS"].includes(request.method))
      return reply(405, { error: "method_not_allowed" });
    const url = new URL(request.url),
      rawSlug = url.searchParams.get("slug"),
      page = Number(url.searchParams.get("page") ?? 0);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 1000 ||
      (rawSlug && !blogSlugSchema.safeParse(rawSlug).success)
    )
      return reply(400, { error: "invalid_query" });
    try {
      const scope = await deps.resolve(code);
      if (!scope) return reply(404, { error: "school_unavailable" });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin && !scope.origins.includes(origin))
        return reply(403, { error: "origin_not_allowed" });
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      }
      if (request.method === "OPTIONS")
        return origin ? reply(204) : reply(403, { error: "origin_required" });
      const result = await deps.posts(scope.schoolId, page, rawSlug || undefined);
      if (rawSlug)
        return result.posts[0]
          ? reply(200, { post: result.posts[0] })
          : reply(404, { error: "post_not_found" });
      return reply(200, {
        posts: result.posts.map(({ body: _body, ...summary }) => summary),
        total: result.total,
        page,
      });
    } catch {
      return reply(503, { error: "blog_unavailable" });
    }
  };
}
