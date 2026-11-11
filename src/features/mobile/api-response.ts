import { ZodError } from "zod";
import { ACTIVE_SCHOOL_UNAVAILABLE } from "@/features/auth/active-school";
import { isSessionMfaError } from "@/integrations/supabase/session-mfa";
import { jsonWithCors } from "@/lib/ecosystem-cors";
import { readJsonBodyLimited } from "@/lib/read-json-body";

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

/** Corpo acima do limite da rota: 413, e não «dados inválidos». */
export class PayloadTooLargeError extends Error {
  constructor() {
    super("Pedido demasiado grande.");
    this.name = "PayloadTooLargeError";
  }
}

/**
 * JSON do pedido da app, com limite de bytes. `null` quando não é JSON (a rota
 * recusa com 422, como antes); acima do limite, `PayloadTooLargeError` (413).
 */
export async function readMobileJson(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readJsonBodyLimited(request, maxBytes);
  if (body.ok) return body.value;
  if (body.reason === "too_large") throw new PayloadTooLargeError();
  return null;
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
    if (error instanceof PayloadTooLargeError) {
      return mobilePrivateJson(
        request,
        { error: "PAYLOAD_TOO_LARGE", message: error.message },
        { status: 413 },
      );
    }
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
