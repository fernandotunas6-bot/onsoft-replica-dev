// Gerado por @lovable.dev/mcp-js e assumido pelo projecto (sem a linha de cabeçalho, o
// plugin deixa de o reescrever). Análise 22, P2-1: a Cloudflare não remove
// `X-Forwarded-Host`/`X-Forwarded-Proto` do pedido do cliente, por isso o endereço do
// recurso OAuth vem do próprio `request.url` e não desses cabeçalhos.
// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: createTanStackMcpHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource",
        trustForwardedHost: false,
        trustForwardedProto: false,
      }),
    },
  },
});
