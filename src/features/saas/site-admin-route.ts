/**
 * Rotas /api/saas/site/* do ADMIN: só administradores da plataforma (Bearer + 2FA, ver
 * platform-guard). Junta o que as quatro rotas repetiam: CORS só para o ADMIN, leitura
 * do corpo JSON e a resposta de erro (401 para sessão ou permissão, 400 para pedido
 * inválido, 500 para o resto).
 */
import type { z } from "zod";
import { requirePlatformAdminFromRequest } from "./platform-guard";
import { jsonWithCors } from "@/lib/ecosystem-cors";

export const SITE_ADMIN_APPS = ["admin"] as const;

export function siteJson(request: Request, body: unknown, status = 200): Response {
  return jsonWithCors(request, body, { status, apps: [...SITE_ADMIN_APPS] });
}

class BadRequest extends Error {}

/** Lê e valida o corpo; um erro aqui responde 400. */
export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequest("Corpo JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    throw new BadRequest(first || "Pedido inválido.");
  }
  return parsed.data;
}

/** Corre `handler` com o administrador da plataforma; traduz os erros em respostas. */
export async function withSiteAdmin(
  request: Request,
  fallback: string,
  handler: (actorUserId: string) => Promise<unknown>,
): Promise<Response> {
  try {
    const actorUserId = await requirePlatformAdminFromRequest(request);
    return siteJson(request, await handler(actorUserId));
  } catch (error) {
    const message = error instanceof Error ? error.message : fallback;
    const status =
      error instanceof BadRequest
        ? 400
        : message === "Unauthorized" || message.includes("Sem permissão")
          ? 401
          : 500;
    return siteJson(request, { error: message }, status);
  }
}
