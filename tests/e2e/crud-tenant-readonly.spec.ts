import { expect, test } from "@playwright/test";
import {
  isUnexpectedCrudSupabaseOrigin,
  resolveCrudStagingConfig,
} from "./helpers/crud-staging-safety";

/**
 * Apenas leitura, opt-in, dois tenants reais de STAGING com marcadores fictícios
 * únicos previamente criados pelas equipas. A suite normal faz skip.
 *
 * Nunca autenticar contra produção e nunca importar storageState para o Git.
 * As duas sessões têm contextos de browser separados, sem partilhar cookies.
 */
const config = resolveCrudStagingConfig(process.env);

test.describe("CRUD Premium — pessoas, isolamento entre escolas @staging-readonly", () => {
  test.skip(!config, "Defina SIGA_CRUD_E2E=1 e duas sessões de staging autorizadas.");
  test.use({
    screenshot: "off",
    trace: "off",
    video: "off",
  });

  test("a pesquisa de Pessoas vê apenas os registos da escola autenticada", async ({ browser }) => {
    if (!config) throw new Error("Staging obrigatório.");

    const check = async (storageState: string, ownName: string, otherName: string) => {
      const context = await browser.newContext({
        storageState,
        baseURL: config.baseUrl,
        viewport: { width: 1280, height: 900 },
      });
      let blockedSupabaseRequests = 0;
      await context.route("**/*", async (route) => {
        // Abortamos qualquer API Supabase diferente do staging declarado.
        // Não registar URLs de pedidos: podem conter identificadores pessoais.
        if (isUnexpectedCrudSupabaseOrigin(route.request().url(), config.supabaseOrigin)) {
          blockedSupabaseRequests += 1;
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      try {
        const page = await context.newPage();
        await page.goto("/pessoas/", { waitUntil: "domcontentloaded" });
        expect(new URL(page.url()).origin).toBe(config.baseUrl);

        // Uma sessão expirada ou acesso negado NÃO contam como isolamento bem-sucedido.
        await expect(page.getByRole("heading", { name: "Registo central" })).toBeVisible();
        const search = page.getByRole("textbox", { name: "Pesquisar pessoa" });

        await search.fill(ownName);
        await expect(page.getByText(ownName, { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Não foi possível carregar pessoas.")).toHaveCount(0);

        // O marcador do outro tenant deve produzir um resultado filtrado vazio,
        // nunca um erro técnico (que também poderia ocultar um registo).
        await search.fill(otherName);
        await expect(
          page.getByText("Nenhum resultado para os filtros aplicados").first(),
        ).toBeVisible();
        await expect(page.getByText(otherName, { exact: true })).toHaveCount(0);
        await expect(page.getByText("Não foi possível carregar pessoas.")).toHaveCount(0);
        expect(blockedSupabaseRequests).toBe(0);
      } finally {
        await context.close();
      }
    };

    // Sessões activas simultaneamente: detecta fuga de cache entre escolas.
    await Promise.all([
      check(config.stateA, config.markerA, config.markerB),
      check(config.stateB, config.markerB, config.markerA),
    ]);
  });
});
