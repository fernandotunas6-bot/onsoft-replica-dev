import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Utilizador ligado",
  description: "Mostra o e-mail e o identificador da conta SIGA Plus ligada ao agente.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const user = { id: ctx.getUserId() ?? "", email: ctx.getUserEmail() ?? "" };
    return { content: [{ type: "text", text: JSON.stringify(user) }], structuredContent: { user } };
  },
});
