import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

// Componentes reais; dados fictícios, sem autenticação nem pedidos ao SGA.
const repository = fileURLToPath(new URL("../../", import.meta.url));
const output = `${repository}/reports/responsive-review`;
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: `${repository}/tests/fixtures/responsive-review/vite.config.ts`,
});
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
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
  for (const theme of ["light", "dark"]) {
    for (const viewport of viewports) {
      const name = `${theme}-${viewport.width}x${viewport.height}`;
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
      if (viewport.width < 640) await page.getByRole("button", { name: /Ocultar filtros/ }).click();
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
        assert(checkbox.width >= 44 && checkbox.height >= 44, "Alvo de selecção demasiado pequeno");
      }
      await page.getByRole("button", { name: "Página seguinte", exact: true }).click();
      assert.equal(await page.getByLabel("Página 2 de 6", { exact: true }).textContent(), "2 / 6");
      await page.getByRole("button", { name: "Primeira página", exact: true }).click();
      const financialTab = page.getByRole("tab", { name: "Situação financeira e recibos" });
      await financialTab.click();
      await expect(financialTab).toHaveAttribute("aria-selected", "true");
      await financialTab.press("ArrowLeft");
      await expect(page.getByRole("tab", { name: "Matrículas e transferências" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByRole("tab", { name: "Alunos", exact: true }).click();
      await noOverflow(page);
      await page.getByRole("combobox", { name: "Curso", exact: true }).click();
      await noOverflow(page);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${name}.png` });

      await page.getByRole("button", { name: "Nova matrícula", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Nova matrícula de estudante — ano lectivo 2026/2027",
      });
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
      await page.getByRole("textbox", { name: "Nome completo", exact: true }).fill("Aluno exemplo");
      await page.getByRole("textbox", { name: "E-mail obrigatório", exact: true }).fill("invalid");
      await submit.click();
      assert.equal(await page.getByTestId("saved").textContent(), "0", "Aceitou e-mail inválido");
      await page
        .getByRole("textbox", { name: "E-mail obrigatório", exact: true })
        .fill("aluno@example.test");
      await submit.click();
      await expect(page.getByTestId("saved")).toHaveText("1");
      await page.screenshot({ path: `${output}/${name}-form.png` });
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
      results.push({ theme, ...viewport, status: "passed" });
      console.log(`${name}: aprovado`);
      await page.close();
    }
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
  await browser.close();
  await server.close();
}
