import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, webkit } from "playwright";
import { expect } from "@playwright/test";

// Componentes reais; dados fictícios, sem autenticação nem pedidos ao SGA.
const repository = fileURLToPath(new URL("../../", import.meta.url));
const output = `${repository}/reports/responsive-review`;
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: `${repository}/tests/fixtures/responsive-review/vite.config.ts`,
});
await server.listen();
const browserTypes = { chromium, webkit };
const browsers = (process.env.SIGA_REVIEW_BROWSERS ?? "chromium,webkit")
  .split(",")
  .map((name) => name.trim());
assert(
  browsers.length && browsers.every((name) => name in browserTypes),
  "Use chromium,webkit em SIGA_REVIEW_BROWSERS.",
);
let browser;
const results = [];
let activePage;
const viewports = [
  { width: 320, height: 900 },
  { width: 375, height: 900 },
  { width: 390, height: 900 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
  { width: 320, height: 480 },
  { width: 640, height: 360 },
];

async function settleAnimations(page) {
  await page.evaluate(async () => {
    const animations = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
}

async function capture(page, path) {
  let previous;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await page.screenshot({ animations: "disabled" });
    if (previous?.equals(current)) {
      await writeFile(path, current);
      return;
    }
    previous = current;
  }
  throw new Error(`A captura não estabilizou: ${path}`);
}

async function noOverflow(page, scope = "body") {
  const measurement = await page
    .locator(scope)
    .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  assert(
    measurement.scroll <= measurement.width + 1,
    `Overflow em ${scope}: ${JSON.stringify(measurement)}`,
  );
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(scroll <= width + 1, `Overflow da página: ${scroll} > ${width}`);
}

try {
  for (const browserName of browsers) {
    browser = await browserTypes[browserName].launch({
      headless: true,
      executablePath: process.env[`SIGA_REVIEW_${browserName.toUpperCase()}_EXECUTABLE`],
      ...(browserName === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    for (const theme of ["light", "dark"]) {
      for (const viewport of viewports) {
        const name = `${browserName}-${theme}-${viewport.width}x${viewport.height}`;
        const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
        activePage = page;
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.goto("http://127.0.0.1:3016", { waitUntil: "networkidle" });
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value === "dark"),
          theme,
        );
        await page.getByRole("heading", { name: "Gestão de estudantes" }).waitFor();
        await noOverflow(page);
        if (viewport.width < 640) {
          assert.equal(await page.getByLabel("Turma", { exact: true }).isVisible(), false);
          await page.getByRole("button", { name: "Filtros", exact: true }).click();
        }
        await page.getByLabel("Turma", { exact: true }).selectOption("a");
        await noOverflow(page, '[data-testid="filters"]');
        await page.getByRole("searchbox").fill("Aluno exemplo");
        await page.waitForFunction(
          () => document.querySelector('[data-testid="search"]')?.textContent === "Aluno exemplo",
        );
        if (viewport.width < 640)
          await page.getByRole("button", { name: /Ocultar filtros/ }).click();
        if (viewport.width < 768) {
          await page
            .getByRole("checkbox", {
              name: "Seleccionar Maria de Jesus da Conceição — aluna de exemplo",
            })
            .first()
            .check();
          assert.equal(await page.getByTestId("selected").textContent(), "example-0");
          const checkbox = await page
            .getByRole("checkbox")
            .first()
            .evaluate((element) => {
              const rect = element.parentElement.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            });
          assert(
            checkbox.width >= 44 && checkbox.height >= 44,
            "Alvo de selecção demasiado pequeno",
          );
        }
        await page.getByRole("button", { name: "Página seguinte", exact: true }).click();
        assert.equal(
          await page.getByLabel("Página 2 de 6", { exact: true }).textContent(),
          "2 / 6",
        );
        await page.getByRole("button", { name: "Primeira página", exact: true }).click();
        const financialTab = page.getByRole("tab", { name: "Situação financeira e recibos" });
        await financialTab.click();
        await expect(financialTab).toHaveAttribute("aria-selected", "true");
        await financialTab.press("ArrowLeft");
        await expect(
          page.getByRole("tab", { name: "Matrículas e transferências" }),
        ).toHaveAttribute("aria-selected", "true");
        await page.getByRole("tab", { name: "Alunos", exact: true }).click();
        await noOverflow(page);
        await page.getByRole("combobox", { name: "Curso", exact: true }).click();
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.scrollTo(0, 0));
        await settleAnimations(page);
        await capture(page, `${output}/${name}.png`);

        await page.getByRole("button", { name: "Nova matrícula", exact: true }).focus();
        await page.getByRole("button", { name: "Nova matrícula", exact: true }).click();
        const dialog = page.getByRole("dialog", {
          name: "Nova matrícula de estudante — ano lectivo 2026/2027",
        });
        await expect(dialog).toBeVisible();
        await settleAnimations(page);
        const rect = await dialog.boundingBox();
        assert(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= viewport.width + 1 &&
            rect.y + rect.height <= viewport.height + 1,
          `Modal fora do ecrã: ${JSON.stringify(rect)}`,
        );
        await noOverflow(page, '[role="dialog"]');
        const submit = page.getByRole("button", { name: "Guardar matrícula", exact: true });
        const footerRect = await submit.boundingBox();
        assert(
          footerRect && footerRect.y >= 0 && footerRect.y + footerRect.height <= viewport.height,
          "Guardar fora do ecrã",
        );
        await submit.click();
        assert.equal(
          await page.getByTestId("saved").textContent(),
          "0",
          "Ignorou validação obrigatória",
        );
        await page
          .getByRole("textbox", { name: "Nome completo", exact: true })
          .fill("Aluno exemplo");
        await page
          .getByRole("textbox", { name: "E-mail obrigatório", exact: true })
          .fill("invalid");
        await submit.click();
        assert.equal(await page.getByTestId("saved").textContent(), "0", "Aceitou e-mail inválido");
        await page
          .getByRole("textbox", { name: "E-mail obrigatório", exact: true })
          .fill("aluno@example.test");
        await submit.click();
        await expect(page.getByTestId("saved")).toHaveText("1");
        await capture(page, `${output}/${name}-form.png`);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        assert.equal(
          await page
            .getByRole("button", { name: "Nova matrícula", exact: true })
            .evaluate((element) => element === document.activeElement),
          true,
          "Foco não voltou ao accionador",
        );

        await page.getByRole("button", { name: "Cadastro por etapas" }).click();
        await page.getByRole("button", { name: "Avançar", exact: true }).click();
        await page
          .getByRole("button", { name: "Etapa 1: Identificação do estudante", exact: true })
          .focus();
        await page.keyboard.press("Enter");
        await expect(
          page.getByRole("button", { name: "Etapa 1: Identificação do estudante", exact: true }),
        ).toHaveAttribute("aria-current", "step");
        await noOverflow(page, '[role="dialog"]');
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Confirmar alteração" }).click();
        const confirmation = await page.getByRole("alertdialog").boundingBox();
        assert(
          confirmation &&
            confirmation.y >= 0 &&
            confirmation.x >= 0 &&
            confirmation.y + confirmation.height <= viewport.height + 1,
          "Confirmação fora do ecrã",
        );
        await page.getByRole("button", { name: "Voltar à revisão" }).click();
        await page.getByRole("button", { name: "Abrir painel protegido" }).click();
        await page.mouse.click(1, 1);
        assert.equal(
          await page.getByRole("dialog", { name: "Painel protegido" }).count(),
          1,
          "Fechou apesar de preventOutsideClose",
        );
        await page.getByRole("button", { name: "Fechar", exact: true }).click();
        assert.deepEqual(errors, [], `Erros de execução: ${errors.join("; ")}`);
        await page.getByRole("button", { name: "Formulário rápido", exact: true }).click();
        const quickDialog = page.getByRole("dialog", {
          name: "Configurar trimestre — amostra local",
        });
        await expect(quickDialog).toBeVisible();
        await settleAnimations(page);
        const quickSave = quickDialog.getByRole("button", { name: "Guardar", exact: true });
        await quickSave.click();
        await expect(page.getByTestId("quick-saved")).toHaveText("0");
        await quickDialog
          .getByRole("textbox", { name: "Nome do trimestre" })
          .fill("Primeiro trimestre");
        await quickDialog.getByLabel("Início do trimestre").fill("2026-09-01");
        const nativeSelect = quickDialog.getByLabel("Turno", { exact: true });
        assert.equal(
          await nativeSelect.evaluate((element) => getComputedStyle(element).colorScheme),
          theme,
          "O selector nativo não acompanha o tema",
        );
        if (viewport.width < 768) {
          const field = await nativeSelect.evaluate((element) => ({
            height: element.getBoundingClientRect().height,
            fontSize: parseFloat(getComputedStyle(element).fontSize),
          }));
          assert(
            field.height >= 44 && field.fontSize >= 16,
            "Selector do formulário rápido demasiado pequeno",
          );
        }
        await noOverflow(page, '[role="dialog"]');
        const quickFooter = await quickSave.boundingBox();
        assert(
          quickFooter &&
            quickFooter.y >= 0 &&
            quickFooter.y + quickFooter.height <= viewport.height,
          "Guardar rápido fora do ecrã",
        );
        await capture(page, `${output}/${name}-quickform.png`);
        await quickDialog.getByRole("textbox", { name: "Nome do trimestre" }).press("Enter");
        await expect(page.getByTestId("quick-saved")).toHaveText("1");
        await expect(quickDialog).toHaveCount(0);
        await page.getByRole("button", { name: "Rever eliminação" }).click();
        await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
        await expect(page.getByTestId("deleted")).toHaveText("1");
        await page.getByRole("button", { name: "Rever ficha longa" }).click();
        const detailDialog = page.getByRole("dialog", {
          name: "Ficha longa — estrutura de consulta",
        });
        await expect(detailDialog).toBeVisible();
        await settleAnimations(page);
        await noOverflow(page, '[role="dialog"]');
        const detailBounds = await detailDialog.boundingBox();
        const detailTitle = await detailDialog.getByRole("heading").boundingBox();
        assert(
          detailBounds &&
            detailTitle &&
            detailTitle.y >= detailBounds.y &&
            detailTitle.y + detailTitle.height <= detailBounds.y + detailBounds.height,
          "Título da ficha fora do diálogo",
        );
        const detailFooter = await detailDialog
          .getByRole("button", { name: "Fechar ficha" })
          .boundingBox();
        assert(
          detailFooter &&
            detailFooter.y >= 0 &&
            detailFooter.y + detailFooter.height <= viewport.height,
          "Rodapé da ficha fora do ecrã",
        );
        await capture(page, `${output}/${name}-detail.png`);
        await detailDialog.getByRole("button", { name: "Fechar ficha" }).click();
        assert.deepEqual(errors, [], `Erros de execução: ${errors.join("; ")}`);
        results.push({
          browser: browserName,
          browserVersion: browser.version(),
          theme,
          ...viewport,
          status: "passed",
        });
        console.log(`${name}: aprovado`);
        await page.close();
      }
    }
    await browser.close();
    browser = undefined;
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      { fixture: "Componentes reais; dados fictícios; sem acesso ao SGA", results },
      null,
      2,
    ),
  );
  console.log(`${results.length} cenários aprovados; capturas em reports/responsive-review.`);
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
