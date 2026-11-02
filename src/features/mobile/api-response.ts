import { ZodError } from "zod";
import { ACTIVE_SCHOOL_UNAVAILABLE } from "@/features/auth/active-school";
import { isSessionMfaError } from "@/integrations/supabase/session-mfa";
import { jsonWithCors } from "@/lib/ecosystem-cors";

/** Textos do SIGA que querem dizer «sem sessão», não uma regra recusada. */
const UNAUTHENTICATED = new Set(["Unauthorized", "Não autenticado."]);

/**
 * As APIs móveis devolvem dados pessoais, notas, notificações e estado da
 * sessão. Nenhuma resposta, incluindo erros de autenticação, pode ser
 * armazenada por browser, proxy intermédio ou cache partilhada.
 */
function mobilePrivateJson(
  request: Request,
  body: unknown,
  init: { status?: number } = {},
): Response {
  return jsonWithCors(request, body, { ...init, noStore: true });
}

/**
 * Resposta das rotas /api/mobile/* (app SIGA Plus). Os erros levam o texto
 * que o SIGA mostra (são escritos para a pessoa e os da base passam por
 * publicDatabaseError). Um erro inesperado ou de configuração não sai: só um
 * código genérico.
 */
export async function mobileRespond(
  request: Request,
  route: string,
  run: () => Promise<unknown>,
): Promise<Response> {
  try {
    return mobilePrivateJson(request, await run());
  } catch (error) {
    // Antes do 401: o erro de 2FA também vem com statusCode 401.
    if (isSessionMfaError(error)) {
      return mobilePrivateJson(
        request,
        { error: "MFA_REQUIRED", message: "Esta conta exige verificação em dois passos." },
        { status: 403 },
      );
    }
    const status = (error as { statusCode?: number } | null)?.statusCode;
    const message = error instanceof Error ? error.message : "";
    if (status === 401 || UNAUTHENTICATED.has(message)) {
      return mobilePrivateJson(request, { error: "SESSION_INVALID" }, { status: 401 });
    }
    if (message === ACTIVE_SCHOOL_UNAVAILABLE) {
      return mobilePrivateJson(
        request,
        {
          error: ACTIVE_SCHOOL_UNAVAILABLE,
          message: "Já não tem acesso activo a esta escola. Entre de novo.",
        },
        { status: 409 },
      );
    }
    if (error instanceof ZodError) {
      // A mensagem do esquema do SIGA (ex.: «Telefone inválido…»), se houver.
      const issue = error.issues.find(
        (i) => i.message && !/^(Required|Expected|Invalid)/.test(i.message),
      );
      return mobilePrivateJson(
        request,
        { error: "INVALID_INPUT", ...(issue ? { message: issue.message } : {}) },
        { status: 422 },
      );
    }
    // Falta de configuração do servidor (variáveis de ambiente): não é para a pessoa.
    const config = /environment variable|SUPABASE_|Lovable Cloud/i.test(message);
    if (error instanceof Error && error.constructor === Error && message && !config) {
      return mobilePrivateJson(request, { error: "REJECTED", message }, { status: 400 });
    }
    console.error(`[${route}]`, error instanceof Error ? error.name : "erro");
    return mobilePrivateJson(request, { error: "FAILURE" }, { status: 500 });
  }
}
