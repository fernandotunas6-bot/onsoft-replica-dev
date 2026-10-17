import { ZodError } from "zod";
import { isSessionMfaError } from "@/integrations/supabase/session-mfa";
import { jsonWithCors } from "@/lib/ecosystem-cors";

/**
 * Resposta das rotas /api/mobile/* (app SIGA Plus). Os erros levam o texto
 * que o SIGA mostra (são escritos para a pessoa e os da base passam por
 * publicDatabaseError). Um erro inesperado não sai: só um código genérico.
 */
export async function mobileRespond(
  request: Request,
  route: string,
  run: () => Promise<unknown>,
): Promise<Response> {
  try {
    return jsonWithCors(request, await run());
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    if (status === 401) {
      return jsonWithCors(request, { error: "SESSION_INVALID" }, { status: 401 });
    }
    if (isSessionMfaError(error)) {
      return jsonWithCors(
        request,
        { error: "MFA_REQUIRED", message: "Esta conta exige verificação em dois passos." },
        { status: 403 },
      );
    }
    if (error instanceof ZodError) {
      return jsonWithCors(request, { error: "INVALID_INPUT" }, { status: 422 });
    }
    if (error instanceof Error && error.constructor === Error && error.message) {
      return jsonWithCors(request, { error: "REJECTED", message: error.message }, { status: 400 });
    }
    console.error(`[${route}]`, error instanceof Error ? error.name : "erro");
    return jsonWithCors(request, { error: "FAILURE" }, { status: 500 });
  }
}
