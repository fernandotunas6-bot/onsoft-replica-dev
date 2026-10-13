import { createFileRoute } from "@tanstack/react-router";

// style-check: route-exempt — endpoint de streaming; a UI vive em /siga-ai.

/**
 * Resposta da IA token a token.
 *
 * Porque é uma rota de API e não uma `createServerFn`: as funções de servidor
 * devolvem um valor, e aqui o valor é um fluxo que dura dezenas de segundos.
 * Esta rota relaia o stream do motor de inferência para o browser em NDJSON
 * (`{"type":"token"}` … `{"type":"done"}`), e o `request.signal` leva o
 * cancelamento até ao modelo: parar liberta o modelo, não deixa só o browser
 * de esperar.
 *
 * Autenticação igual ao resto do SIGA: `Authorization: Bearer <access_token>`
 * validado pelo Supabase (com 2FA confirmado em `resolveBearerSession`) e
 * membership activa resolvida no servidor. Nenhum `schoolId` do cliente.
 */
export const Route = createFileRoute("/api/siga-ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveBearerSession } = await import("@/features/saas/platform-guard");
        const { resolveSgaMembershipAdmin } = await import("@/integrations/supabase/sga-admin");
        const { askAiStream } = await import("@/features/siga-ai/gateway.server");
        const { askAiInputSchema } = await import("@/features/siga-ai/schemas");
        const { encodeGatewayEvent } = await import("@/features/siga-ai/stream-parse");

        let userId: string;
        try {
          ({ userId } = await resolveBearerSession(request.headers.get("Authorization")));
        } catch {
          return new Response(JSON.stringify({ error: "Sessão inválida." }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let input: ReturnType<typeof askAiInputSchema.parse>;
        try {
          input = askAiInputSchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Pergunta inválida." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const membership = await resolveSgaMembershipAdmin(userId);
        if (!membership) {
          return new Response(JSON.stringify({ error: "Sem membership activa nesta escola." }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const event of askAiStream(membership, userId, input, request.signal)) {
                controller.enqueue(encoder.encode(encodeGatewayEvent(event)));
              }
            } catch (error) {
              // O erro vai como evento: a resposta já começou com 200 e o
              // browser não pode voltar atrás no código de estado.
              const message =
                error instanceof Error
                  ? error.message
                  : "A IA não conseguiu responder. Tente novamente.";
              if (!request.signal.aborted) {
                controller.enqueue(encoder.encode(encodeGatewayEvent({ type: "error", message })));
              }
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
            // Sem isto, um proxy pode acumular a resposta e entregar tudo no
            // fim — streaming que não chega a ser streaming.
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
  component: SigaAiChatApiPlaceholder,
});

function SigaAiChatApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">SIGA AI — streaming</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        POST autenticado. O assistente vive em /siga-ai.
      </p>
    </main>
  );
}
