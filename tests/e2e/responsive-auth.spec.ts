import { expect, test } from "@playwright/test";

/**
 * Homologação de interface com sessão EXISTENTE, apenas de leitura.
 *
 * Opt-in: SIGA_RESPONSIVE_E2E=1 + SIGA_RESPONSIVE_AUTH_STATE=<ficheiro local>.
 * Usa um servidor da app no próprio computador; não autentica, cria ou altera
 * contas, notas, matrículas, pagamentos nem dados de qualquer escola.
 *
 * A sessão é fornecida por quem executa, nunca versionada. Capturas de ecrã
 * (que podem conter dados pessoais) só são criadas se explicitamente pedidas.
 */
const enabled = process.env.SIGA_RESPONSIVE_E2E === "1";
const stateFile = process.env.SIGA_RESPONSIVE_AUTH_STATE?.trim();
const rootUrl = process.env.VITE_SIGA_URL ?? "http://localhost:3006";
const route = process.env.SIGA_RESPONSIVE_PATH ?? "/";
const formRoute = process.env.SIGA_RESPONSIVE_FORM_PATH?.trim();
const capture = process.env.SIGA_RESPONSIVE_CAPTURE === "1";

if (enabled) {
  const url = new URL(rootUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Homologação responsiva: executar apenas contra um servidor local.");
  }
  if (!stateFile) throw new Error("Homologação responsiva: sessão autorizada em falta.");
  if (!route.startsWith("/") || route.startsWith("//")) {
    throw new Error("Homologação responsiva: a rota deve ser interna ao SIGA.");
  }
  if (formRoute && (!formRoute.startsWith("/") || formRoute.startsWith("//"))) {
    throw new Error("Homologação responsiva: formulário deve ter uma rota interna.");
  }
}

test.describe("SIGA — matriz responsiva autenticada, sem escritas", () => {
  test.skip(!enabled, "Requer SIGA_RESPONSIVE_E2E=1 e uma sessão de staging autorizada.");

  // Playwright não abre o ficheiro da sessão quando o modo opt-in está desligado.
  // Desliga gravações automáticas: os ecrãs podem conter informação de alunos.
  test.use({
    storageState: stateFile ?? { cookies: [], origins: [] },
    screenshot: "off",
    trace: "off",
    video: "off",
  });

  for (const width of [320, 375, 390, 768, 1024, 1280, 1536, 1920]) {
    test(`layout legível sem rolagem lateral global em ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#conteudo-principal")).toBeVisible();

      // Um login expirado não deve ser confundido com validação positiva.
      const navigation = page.getByRole("navigation", { name: "Navegação principal" });
      if (width < 1024) {
        await expect(navigation).toBeVisible();
      } else {
        await expect(navigation).toBeHidden();
      }

      if (width < 1536) {
        await expect(page.getByRole("button", { name: "Abrir mensagens" }).last()).toBeVisible();
      } else {
        await expect(page.getByRole("complementary", { name: "Painel lateral" })).toBeVisible();
      }

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(
        overflow.document,
        `Rolagem horizontal em ${width}px (documento ${overflow.document}px)`,
      ).toBeLessThanOrEqual(overflow.viewport + 2);

      if (capture) {
        // Só no disco local, dentro de test-results/ (ignorado pelo Git).
        await page.screenshot({
          path: testInfo.outputPath(`siga-${width}px.png`),
          animations: "disabled",
        });
      }
    });
  }

  test("contexto da escola e notificações abrem a 390px sem trocar dados", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#conteudo-principal")).toBeVisible();

    await page.getByRole("button", { name: "Alterar escola, ano lectivo ou período" }).click();
    await expect(page.getByText("Escola, ano lectivo e período em uso")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Notificações/ }).click();
    await expect(page.getByRole("heading", { name: "Notificações" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("guardar e atalhos flutuantes nunca se sobrepõem", async ({ page }) => {
    test.skip(!formRoute, "Defina SIGA_RESPONSIVE_FORM_PATH com um formulário autorizado.");
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(formRoute!, { waitUntil: "domcontentloaded" });
      const save = page.locator("[data-siga-save-bar]");
      const shortcuts = page.locator("[data-siga-rail-shortcuts]");
      await expect(save).toBeVisible();
      await expect(shortcuts).toBeVisible();
      const saveBox = await save.boundingBox();
      const shortcutBox = await shortcuts.boundingBox();
      expect(saveBox).not.toBeNull();
      expect(shortcutBox).not.toBeNull();
      expect(shortcutBox!.y + shortcutBox!.height).toBeLessThanOrEqual(saveBox!.y);
    }
  });
});
