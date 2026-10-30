import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveBearerUserId } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import {
  mobilePresenceSubmit,
  mobilePresenceToday,
  presenceScanInputSchema,
} from "@/features/pedagogica/school-qr-server";

// style-check: route-exempt — API da app SIGA (Flutter) para a presença do professor.

const APPS = ["siga", "web"] as const;
const schoolIdSchema = z.string().uuid();
const postSchema = presenceScanInputSchema.extend({ schoolId: z.string().uuid() });

function failure(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : "Pedido inválido.";
  const status =
    message === "Unauthorized"
      ? 401
      : /permiss|autoriza|não está ligada|outra escola|outra conta/i.test(message)
        ? 403
        : error instanceof z.ZodError
          ? 400
          : 422;
  return jsonWithCors(
    request,
    { error: status === 401 ? "Sessão expirada. Volte a entrar." : message },
    { status, apps: [...APPS] },
  );
}

/**
 * GET  /api/mobile/presence?schoolId=…  modo da escola e aulas de hoje do professor
 * POST /api/mobile/presence             leitura do QR da escola (também da fila offline)
 *
 * Bearer do Supabase (com 2FA quando a conta o tem). O servidor decide tudo: a app
 * só lê o QR, a localização e a hora do telemóvel.
 */
export const Route = createFileRoute("/api/mobile/presence")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          // Bearer validado pelo Supabase, com 2FA quando a conta o tem; a escola e o
          // papel de professor confirmam-se em requireTeacherForPresence.
          const userId = await resolveBearerUserId(request.headers.get("Authorization"));
          const schoolId = schoolIdSchema.parse(new URL(request.url).searchParams.get("schoolId"));
          return jsonWithCors(request, await mobilePresenceToday(userId, schoolId), {
            apps: [...APPS],
          });
        } catch (error) {
          return failure(request, error);
        }
      },
      POST: async ({ request }) => {
        try {
          const userId = await resolveBearerUserId(request.headers.get("Authorization"));
          const { schoolId, ...scan } = postSchema.parse(await request.json());
          return jsonWithCors(request, await mobilePresenceSubmit(userId, schoolId, scan), {
            apps: [...APPS],
          });
        } catch (error) {
          return failure(request, error);
        }
      },
    },
  },
  component: MobilePresenceApiPlaceholder,
});

function MobilePresenceApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de presença (app)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Usada pela app SIGA para ler o QR da escola. Abra «Presença» no portal do professor.
      </p>
    </main>
  );
}
