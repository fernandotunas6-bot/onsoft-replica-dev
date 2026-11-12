import { createFileRoute } from "@tanstack/react-router";
import { signInWithIdentifierFn } from "@/features/access/server";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { readJsonBodyLimited } from "@/lib/read-json-body";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).
const MAX_LOGIN_JSON_BYTES = 16 * 1024;

/**
 * Entrada na app móvel com o identificador do SIGA: e-mail, B.I., telefone ou o
 * número de aluno. É o mesmo `signInWithIdentifierFn` do ecrã de entrada do portal,
 * com os mesmos limites por IP e por conta, a opção da escola para o número de aluno
 * e a mesma resposta para conta desconhecida e senha errada.
 *
 * O número de aluno repete-se de escola para escola: o SIGA escolhe a escola pelo
 * endereço do pedido. A app chama esta rota no subdomínio da escola
 * (`https://<escola>.portal-siga.com/api/mobile/login`) quando a pessoa usa o número.
 *
 *   POST { identifier, password, captcha_token? }
 *     200 { access_token, refresh_token }
 *     401 { error: "invalid_credentials" | "captcha_failed" | "email_not_confirmed" | … }
 *     429 { error: "rate_limited" }
 *
 * A app troca logo o refresh_token por uma sessão completa no Auth do SIGA.
 */
export const Route = createFileRoute("/api/mobile/login")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      POST: async ({ request }) => {
        // Evita consumir corpos arbitrariamente grandes na rota pública de login.
        const parsed = await readJsonBodyLimited(request, MAX_LOGIN_JSON_BYTES);
        if (!parsed.ok && parsed.reason === "too_large") {
          return jsonWithCors(
            request,
            { error: "payload_too_large" },
            { status: 413, noStore: true },
          );
        }
        // Preserva a validação definitiva do esquema já usada no portal.
        const body = (parsed.ok ? parsed.value : null) as MobileLoginBody | null;
        let result: Awaited<ReturnType<typeof signInWithIdentifierFn>>;
        try {
          result = await signInWithIdentifierFn({
            data: {
              identifier: body?.identifier,
              password: body?.password,
              ...(body?.captcha_token ? { captchaToken: body.captcha_token } : {}),
            },
          } as never);
        } catch (error) {
          // Entrada inválida (422) e falhas inesperadas: a resposta comum das rotas móveis.
          const response = await mobileRespond(request, "api/mobile/login", async () => {
            throw error;
          });
          response.headers.set("Cache-Control", "no-store");
          return response;
        }
        if (result.ok) {
          return jsonWithCors(
            request,
            {
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
            },
            { noStore: true },
          );
        }
        const status =
          result.error === "rate_limited" ? 429 : result.error === "unavailable" ? 503 : 401;
        return jsonWithCors(request, { error: result.error }, { status, noStore: true });
      },
    },
  },
});

type MobileLoginBody = { identifier?: unknown; password?: unknown; captcha_token?: unknown };
