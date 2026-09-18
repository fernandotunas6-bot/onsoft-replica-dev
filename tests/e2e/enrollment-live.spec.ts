import { test, expect } from "@playwright/test";
import {
  buildSignupPayload,
  ECOSYSTEM_E2E_URLS,
  getPublicEnrollmentUrl,
  isLiveE2EEnabled,
  uniqueE2ESlug,
} from "./helpers/ecosystem-urls";
import {
  E2E_LIVE_ADMIN_PASSWORD,
  cleanupE2ETenantBySlug,
  ensureE2EAdminPassword,
  findSchoolIdByTenantSlug,
  getAcceptedApplicationStudentId,
} from "./helpers/sga-live-admin";

const OPEN_SETTINGS_EVENT = "siga:open-settings-panel";

test.describe("Matrícula pública @live", () => {
  test.skip(!isLiveE2EEnabled(), "Defina SIGA_E2E_LIVE=1 com apps locais e Supabase configurado.");

  test("candidatura pública → aceitar → aluno criado", async ({ page, request }) => {
    const slug = uniqueE2ESlug("mat");
    const payload = buildSignupPayload(slug);
    const candidateName = `Candidato E2E ${slug}`;

    try {
      const signup = await request.post(`${ECOSYSTEM_E2E_URLS.siga}/api/saas/signup`, {
        data: payload,
      });
      expect(signup.ok()).toBeTruthy();

      await ensureE2EAdminPassword(payload.admin_email);

      await page.goto(getPublicEnrollmentUrl(slug));
      await page.getByLabel("Nome completo").fill(candidateName);
      await page.getByRole("button", { name: "Enviar candidatura" }).click();
      await expect(page.getByRole("heading", { name: "Candidatura enviada" })).toBeVisible({
        timeout: 30_000,
      });

      await page.goto(ECOSYSTEM_E2E_URLS.siga);
      await page.getByLabel("Email ou Nº de BI / NIF").fill(payload.admin_email);
      await page.getByLabel("Senha").fill(E2E_LIVE_ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Entrar no Portal" }).click();
      await expect(
        page.getByText("Primeiros passos da escola").or(page.getByText("Visão Geral")),
      ).toBeVisible({
        timeout: 60_000,
      });

      await page.evaluate((eventName) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { panelId: "matricula" } }));
      }, OPEN_SETTINGS_EVENT);

      await expect(page.getByText("Matrícula pública").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(candidateName)).toBeVisible({ timeout: 30_000 });

      const soloCandidate = page.getByRole("button", { name: "Só candidato" });
      if (await soloCandidate.isVisible()) {
        await soloCandidate.click();
      } else {
        await page
          .getByRole("button", { name: /^Aceitar/ })
          .first()
          .click();
      }

      await expect(page.getByText(/Candidatura aceite/i)).toBeVisible({ timeout: 30_000 });

      const schoolId = await findSchoolIdByTenantSlug(slug);
      expect(schoolId).toBeTruthy();
      const application = await getAcceptedApplicationStudentId(schoolId!, candidateName);
      expect(application?.status).toBe("accepted");
      expect(application?.student_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    } finally {
      await cleanupE2ETenantBySlug(slug, payload.admin_email).catch(() => undefined);
    }
  });
});
