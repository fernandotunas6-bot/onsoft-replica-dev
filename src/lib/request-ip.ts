/**
 * Extrai o IP do cliente de um `Request` cru (rotas `createFileRoute` com
 * `server.handlers`, que não passam pelo middleware do TanStack Start e por
 * isso não têm `getRequestIP()`). Extraído de `src/routes/api/saas/signup.tsx`
 * para reutilizar nos outros webhooks públicos.
 */
export function clientIpFromRequest(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
