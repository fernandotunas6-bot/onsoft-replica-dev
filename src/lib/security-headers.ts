/**
 * Cabeçalhos de segurança em todas as respostas do Worker do SIGA (páginas e
 * API). As páginas são geradas no Worker, por isso o `_headers` dos ficheiros
 * estáticos não as cobre.
 *
 * - HSTS: só HTTPS, também nos subdomínios das escolas (todos na Cloudflare).
 * - X-Frame-Options SAMEORIGIN: outro site não pode embeber o SIGA num iframe
 *   (clickjacking). A pré-visualização de impressão usa `srcDoc`, não afectada.
 * - Permissions-Policy: câmara (fotografias) e GPS (presença dos professores)
 *   só para o próprio SIGA; microfone, pagamentos e USB desligados.
 *
 * Não inclui Content-Security-Policy: precisa de inventariar scripts e
 * ligações externas primeiro, e uma CSP errada parte a aplicação.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
};

/** Acrescenta os cabeçalhos em falta; os que uma rota já definiu ficam. */
export function withSecurityHeaders(response: Response): Response {
  // 101 (WebSocket) não pode ser recriada com `new Response`.
  if (response.status === 101) return response;
  const missing = Object.entries(SECURITY_HEADERS).filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) return response;
  const secured = new Response(response.body, response);
  for (const [name, value] of missing) secured.headers.set(name, value);
  return secured;
}
