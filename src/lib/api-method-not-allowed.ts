/**
 * Uma rota `/api/*` sem handler para o método (ex.: POST numa rota só GET) caía
 * no router da aplicação e devolvia a página HTML com 200. Um cliente da API lia
 * isso como sucesso. Para métodos de escrita responde-se 405 em JSON; os GET
 * ficam como estão, porque algumas rotas da API têm página própria.
 */
export function apiMethodNotAllowed(request: Request, response: Response): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;
  if (response.status !== 200) return null;
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html"))
    return null;
  return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
    status: 405,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
