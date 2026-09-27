import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_class_groups",
  title: "Listar turmas",
  description: "Lista as turmas activas que o utilizador ligado pode ver na sua escola.",
  inputSchema: {
    search: z.string().trim().max(80).optional().describe("Filtrar pelo nome ou código da turma."),
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de turmas (por omissão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    let query = supabaseForUser(ctx)
      .from("class_groups")
      .select("id, code, name, shift, status, capacity")
      .is("deleted_at", null)
      .order("name")
      .limit(limit ?? 50);
    if (search) {
      const term = search.replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const turmas = (data ?? []).map((t) => ({
      id: String(t.id),
      code: String(t.code),
      name: String(t.name),
      shift: String(t.shift),
      status: String(t.status),
      capacity: typeof t.capacity === "number" ? t.capacity : null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(turmas) }],
      structuredContent: { turmas },
    };
  },
});
