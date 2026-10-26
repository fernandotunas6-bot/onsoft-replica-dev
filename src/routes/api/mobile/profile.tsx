import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { getCurrentAccountContext, updateCurrentProfile } from "@/features/auth/server";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * O próprio perfil (nome e telefone) pela app móvel, com as funções do SIGA:
 * o telefone é validado e normalizado (+244) e a gravação só acontece se o
 * perfil não mudou entretanto noutro aparelho (expected_updated_at).
 *
 *   GET                                      { full_name, phone, updated_at, school_name }
 *   POST { full_name, phone, expected_updated_at }
 */
export const Route = createFileRoute("/api/mobile/profile")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/profile", async () => {
          const ctx = (await getCurrentAccountContext({ data: {} } as never)) as {
            full_name: string | null;
            phone: string | null;
            updated_at: string | null;
            school_name: string | null;
          };
          // Só o que o ecrã usa: nada de papéis, permissões ou fichas ligadas.
          return {
            full_name: ctx.full_name,
            phone: ctx.phone,
            updated_at: ctx.updated_at,
            school_name: ctx.school_name,
          };
        }),
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/profile", async () => {
          const body = (await request.json().catch(() => null)) as MobileProfileBody | null;
          if (!body || typeof body !== "object") throw new ZodError([]);
          return updateCurrentProfile({
            data: {
              fullName: body.full_name,
              phone: body.phone ?? undefined,
              expectedUpdatedAt: body.expected_updated_at,
            },
          } as never);
        }),
    },
  },
});

type MobileProfileBody = { full_name?: unknown; phone?: unknown; expected_updated_at?: unknown };
