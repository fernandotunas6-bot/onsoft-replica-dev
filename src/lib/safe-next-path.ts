/**
 * Destino depois de entrar, vindo de `?next=` (ex.: o fim do registo da escola
 * no WEB oferece o painel ou o guia de configuração). Só caminhos relativos do
 * próprio SIGA: nunca outro domínio (`//x`, `/\x`, ou com espaços/tabs que o
 * navegador remove) nem as rotas /auth/*.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !/^\/(?![/\\])[^\s\\]*$/.test(raw)) return "/";
  if (raw.startsWith("/auth/")) return "/";
  return raw;
}
