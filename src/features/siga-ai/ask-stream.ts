/**
 * Consumo do stream do gateway, do lado do browser.
 *
 * Sem o sufixo `.client`: o `import-protection` do TanStack Start recusa esses
 * ficheiros no ambiente de servidor, e este módulo é importado por um
 * componente que é renderizado no servidor (só o seu corpo é que corre no
 * browser, dentro de um handler).
 *
 * Fala com `/api/siga-ai/chat` (NDJSON) e entrega os tokens à medida que
 * chegam. Se o streaming não estiver disponível — proxy que acumula a
 * resposta, endpoint em falta, 4xx/5xx —, quem chama recebe
 * `StreamUnavailableError` e volta à resposta completa pela função de
 * servidor: a conversa continua a funcionar, só sem o efeito de escrita.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseGatewayEvent, splitLines, type GatewayEvent } from "./stream-parse";
import type { AskAiInput } from "./schemas";

export class StreamUnavailableError extends Error {}

export async function askAiStreaming(
  input: AskAiInput,
  handlers: { onToken: (text: string) => void; signal?: AbortSignal },
): Promise<Extract<GatewayEvent, { type: "done" }>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new StreamUnavailableError("Sessão sem token.");

  let response: Response;
  try {
    response = await fetch("/api/siga-ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      ...(handlers.signal ? { signal: handlers.signal } : {}),
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new StreamUnavailableError("Não foi possível abrir o stream.");
  }

  if (!response.ok || !response.body) {
    // Erros de permissão e de pedido são para mostrar, não para repetir sem
    // streaming: repetir daria o mesmo 401/403 por outro caminho.
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Sem permissão para usar o assistente.");
    }
    throw new StreamUnavailableError(`Streaming indisponível (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let done: Extract<GatewayEvent, { type: "done" }> | null = null;
  let sawToken = false;

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const { lines, rest } = splitLines(buffer);
      buffer = rest;
      for (const line of lines) {
        const event = parseGatewayEvent(line);
        if (!event) continue;
        if (event.type === "token") {
          sawToken = true;
          handlers.onToken(event.text);
        } else if (event.type === "error") {
          // Já houve texto no ecrã: o erro é real e é para mostrar. Sem texto
          // nenhum, pode ser o próprio stream a falhar — volta ao caminho completo.
          if (sawToken) throw new Error(event.message);
          throw new StreamUnavailableError(event.message);
        } else {
          done = event;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (!done) throw new StreamUnavailableError("O stream terminou sem resposta completa.");
  return done;
}
