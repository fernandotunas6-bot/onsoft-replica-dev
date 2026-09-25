import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export class AiGatewayError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function friendlyMessage(status: number, fallback: string) {
  if (status === 402) return "Os créditos de IA do espaço de trabalho acabaram. Adicione créditos em Definições → Planos e créditos.";
  if (status === 429) return "Demasiados pedidos à IA neste momento. Tente novamente dentro de alguns minutos.";
  if (status === 403) return "O acesso ao modelo de IA foi recusado para este espaço de trabalho.";
  if (status === 401) return "A IA não está configurada neste servidor.";
  return fallback;
}

/** Chamada única à IA (streaming consumido no servidor); devolve o texto final. */
export async function runAiText(system: string, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiGatewayError(friendlyMessage(401, ""), 401);
  let runId: string | undefined;
  let upstreamStatus = 0;
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
      const response = await fetch(input, { ...init, headers });
      runId ??= response.headers.get(RUN_ID_HEADER) ?? undefined;
      if (!response.ok) upstreamStatus = response.status;
      return response;
    },
  });
  let streamError: unknown;
  const result = streamText({
    model: provider.responses(MODEL),
    system,
    prompt,
    maxRetries: 0,
    onError: ({ error }) => {
      streamError = error;
    },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  let text = "";
  try {
    text = await result.text;
  } catch (error) {
    streamError ??= error;
  }
  if (streamError || !text.trim()) {
    const status =
      upstreamStatus ||
      Number((streamError as { statusCode?: number } | undefined)?.statusCode ?? 0) ||
      500;
    throw new AiGatewayError(
      friendlyMessage(status, "A IA não conseguiu responder. Tente novamente mais tarde."),
      status,
    );
  }
  return text;
}

/** Extrai o primeiro objecto JSON do texto do modelo. */
export function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
