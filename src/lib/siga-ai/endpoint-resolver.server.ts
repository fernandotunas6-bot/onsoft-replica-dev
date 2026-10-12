/**
 * Resolução dos modos de funcionamento do SIGA AI (§4 do pedido) e defesa do
 * endpoint configurável.
 *
 * Modo A (`local`)         — Ollama no computador do utilizador/servidor da aplicação.
 * Modo B (`school_server`) — servidor da escola na rede interna, endpoint configurado.
 * Modo C (`remote`)        — serviço remoto institucional, só com autorização da escola.
 *
 * Nenhum destes URL chega ao browser: o browser fala sempre com o gateway do
 * SIGA, que fala com o Ollama/Qdrant. É isso que impede expor o Ollama
 * publicamente e que mantém o controlo de permissões do lado do servidor.
 */

export class AiEndpointError extends Error {
  constructor(
    message: string,
    public code: "unsafe_endpoint" | "not_configured" | "remote_not_allowed",
  ) {
    super(message);
  }
}

/** Anfitriões de rede local — aceites fora de produção sem lista de permissões. */
function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const m = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal");
}

function allowedHosts(): string[] {
  return (process.env["SIGA_AI_ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Valida um endpoint configurado por um administrador de escola.
 *
 * O valor vem da base de dados mas é escrito por uma pessoa, e o servidor vai
 * buscá-lo com a chave de serviço: sem esta validação é um SSRF com credenciais
 * de infraestrutura. Em produção só passam anfitriões de `SIGA_AI_ALLOWED_HOSTS`;
 * fora de produção passam também os da rede local, para a escola poder apontar
 * ao seu próprio servidor em desenvolvimento.
 */
export function assertSafeAiEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AiEndpointError("Endereço do serviço de IA inválido.", "unsafe_endpoint");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AiEndpointError(
      "O endereço tem de começar por http:// ou https://.",
      "unsafe_endpoint",
    );
  }
  if (url.username || url.password) {
    throw new AiEndpointError(
      "O endereço não pode conter utilizador nem senha.",
      "unsafe_endpoint",
    );
  }
  if (url.search || url.hash) {
    throw new AiEndpointError("O endereço não pode ter parâmetros.", "unsafe_endpoint");
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts();
  if (allowed.includes(host)) return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  const isProduction = process.env["NODE_ENV"] === "production";
  if (!isProduction && isPrivateHost(host)) {
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  throw new AiEndpointError(
    isProduction
      ? "Este endereço não consta da lista de servidores de IA autorizados da plataforma."
      : "Endereço fora da rede local. Em produção precisa de constar de SIGA_AI_ALLOWED_HOSTS.",
    "unsafe_endpoint",
  );
}

export type AiSettingsRow = {
  enabled: boolean;
  mode: "local" | "school_server" | "remote";
  endpoint_url: string | null;
  vector_url: string | null;
  chat_model: string | null;
  remote_allowed: boolean;
};

export type ResolvedAiEndpoints = {
  mode: AiSettingsRow["mode"];
  /** Base do Ollama/servidor compatível com OpenAI, sem barra final. */
  chatBaseUrl: string;
  /** Base do Qdrant, sem barra final. `null` = sem base documental. */
  vectorBaseUrl: string | null;
  chatModel: string | null;
};

const stripSlash = (value: string) => value.trim().replace(/\/+$/, "");

/**
 * Decide com que serviços falar. A configuração da escola manda; o ambiente
 * fornece o que a escola não configurou (instalação institucional).
 */
export function resolveAiEndpoints(settings: AiSettingsRow): ResolvedAiEndpoints {
  if (settings.mode === "remote" && !settings.remote_allowed) {
    throw new AiEndpointError(
      "O modo remoto não está autorizado por esta escola. Active-o em Configurações → SIGA AI.",
      "remote_not_allowed",
    );
  }

  const envChat = process.env["SIGA_AI_OLLAMA_URL"];
  const envVector = process.env["SIGA_AI_QDRANT_URL"];

  const chatRaw = settings.endpoint_url?.trim() || envChat?.trim() || "";
  if (!chatRaw) {
    throw new AiEndpointError(
      "Nenhum serviço de IA configurado. Indique o endereço do servidor em Configurações → SIGA AI.",
      "not_configured",
    );
  }
  // Endpoint escrito pela escola: validar. Endpoint do ambiente: é da própria
  // instalação, já passou pelo administrador da plataforma.
  const chatBaseUrl = settings.endpoint_url?.trim()
    ? assertSafeAiEndpoint(settings.endpoint_url)
    : stripSlash(chatRaw);

  const vectorRaw = settings.vector_url?.trim() || envVector?.trim() || "";
  const vectorBaseUrl = vectorRaw
    ? settings.vector_url?.trim()
      ? assertSafeAiEndpoint(settings.vector_url)
      : stripSlash(vectorRaw)
    : null;

  return {
    mode: settings.mode,
    chatBaseUrl,
    vectorBaseUrl,
    chatModel: settings.chat_model?.trim() || process.env["SIGA_AI_CHAT_MODEL"]?.trim() || null,
  };
}
