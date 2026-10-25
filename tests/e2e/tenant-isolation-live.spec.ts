import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  buildSignupPayload,
  ECOSYSTEM_E2E_URLS,
  isLiveE2EEnabled,
  uniqueE2ESlug,
} from "./helpers/ecosystem-urls";
import {
  cleanupE2ETenantBySlug,
  ensureE2EAdminPassword,
  E2E_LIVE_ADMIN_PASSWORD,
  findSchoolIdByTenantSlug,
  getLiveSupabaseAdmin,
} from "./helpers/sga-live-admin";

/**
 * Uma conta vê a sua membership mas não a de outra escola.
 *
 * O teste usa dois tenants criados apenas no staging e dois JWTs reais.
 * A leitura positiva das memberships evita falso verde com uma tabela
 * inacessível ou vazia; a leitura negativa prova o bloqueio entre escolas.
 *
 * Não substitui o E2E da autorização das server functions, RBAC ou MFA:
 * este percurso verifica especificamente a fronteira RLS da Data API.
 */
test.describe("Isolamento multi-tenant @live — Supabase RLS", () => {
  test.skip(!isLiveE2EEnabled(), "Requer SIGA_E2E_LIVE=1 e staging isolado.");
  test("admins de duas escolas não lêem os vínculos uns dos outros", async ({ request }) => {
    test.setTimeout(180_000);
    const slugA = uniqueE2ESlug("e2e-iso-a");
    const slugB = uniqueE2ESlug("e2e-iso-b");
    const schools = [slugA, slugB] as const;

    // Antes de qualquer escrita, confirmar opt-in e project ref isolado.
    getLiveSupabaseAdmin();

    try {
      const users: Array<{ schoolId: string; userId: string; email: string }> = [];

      for (const slug of schools) {
        const payload = buildSignupPayload(slug);
        const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
          data: payload,
        });
        expect(signup.ok(), `Provisionamento da escola de ensaio ${slug}`).toBe(true);
        const userId = await ensureE2EAdminPassword(payload.admin_email);
        const schoolId = await findSchoolIdByTenantSlug(slug);
        expect(schoolId, `Escola ${slug} criada com vínculo`).toBeTruthy();
        users.push({ schoolId: schoolId!, userId, email: payload.admin_email });
      }

      const [a, b] = users;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.schoolId).not.toBe(b!.schoolId);
      expect(a!.userId).not.toBe(b!.userId);

      // O cliente de cada pessoa usa somente a chave publicável; a service
      // key nunca entra nas operações que provam a autorização RLS.
      const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
      const publishable =
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        "";
      expect(url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/);
      expect(publishable.length).toBeGreaterThan(10);

      const clients = users.map(() =>
        createClient(url, publishable, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }),
      );

      for (const [index, user] of users.entries()) {
        const { data, error } = await clients[index]!.auth.signInWithPassword({
          email: user.email,
          password: E2E_LIVE_ADMIN_PASSWORD,
        });
        expect(error, "A autenticação real da conta de staging deve funcionar").toBeNull();
        expect(data.user?.id).toBe(user.userId);
        expect(data.session?.access_token).toBeTruthy();
      }

      for (const [index, user] of users.entries()) {
        const other = users[1 - index]!;
        const client = clients[index]!;

        const { data: own, error: ownError } = await client
          .from("school_memberships")
          .select("school_id, user_id")
          .eq("user_id", user.userId)
          .eq("school_id", user.schoolId);
        expect(ownError, "A membership da própria escola deve ser consultável").toBeNull();
        expect(
          own?.some((row) => row.user_id === user.userId && row.school_id === user.schoolId),
          "Prova positiva: sessão autenticada consegue ler o próprio vínculo",
        ).toBe(true);

        const { data: foreign, error: foreignError } = await client
          .from("school_memberships")
          .select("school_id, user_id")
          .eq("school_id", other.schoolId)
          .eq("user_id", other.userId);
        if (foreignError) {
          // Revogação de acesso à tabela também é isolamento válido, desde que
          // a leitura positiva anterior tenha comprovado a própria conta.
          expect(["42501", "PGRST301"].includes(foreignError.code)).toBe(true);
        } else {
          expect(
            foreign ?? [],
            "Fuga: uma escola recebeu a membership autenticada da outra",
          ).toEqual([]);
        }
      }
    } finally {
      for (const slug of [...schools].reverse()) {
        // Limpeza só permite slugs reservados de E2E e contas @siga-plus.test.
        // O erro de limpeza não deve ocultar o erro original do ensaio.
        const email = buildSignupPayload(slug).admin_email;
        await cleanupE2ETenantBySlug(slug, email).catch((error: unknown) => {
          console.error(
            `Falha na limpeza da escola E2E ${slug}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
          );
        });
      }
    }
  });
});
