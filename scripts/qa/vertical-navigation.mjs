// Controlled browser audit: actual Tabs/CSS, synthetic data, no authenticated requests.
import { mkdtemp, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { chromium } from "playwright";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "siga-nav-qa-"));
let server;
let browser;
try {
  await symlink(
    await realpath(join(repoRoot, "node_modules")),
    join(temporary, "node_modules"),
    "dir",
  );
  await writeFile(
    join(temporary, "index.html"),
    '<html lang="pt"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
  );
  await writeFile(
    join(temporary, "main.tsx"),
    "import React from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {Tabs,TabsList,TabsTrigger,TabsContent,TabsPanels} from '@/components/ui/tabs';\nimport './fixture.css';\nconst sections=['Estrutura académica','Modelos de avaliação','Currículo & Turnos','Disciplinas','Competências','Turmas','Horários','Salas & Espaços','Presenças / Chamada','Notas','Pautas','Exames e resultado final','NomeInstitucionalMuitoLongoSemEspaçosParaTestarQuebraDeLinha' ];\ncreateRoot(document.getElementById('root')!).render(<div className=\"min-h-screen bg-background text-foreground\"><aside className=\"fixed inset-y-0 left-0 hidden w-60 bg-slate-900 p-5 text-white lg:block\">SIGA Plus<div className=\"mt-8\">Ensino e aprendizagem</div></aside><main className=\"p-5 lg:ml-60\"><h1 className=\"mb-6 text-2xl\">Ensino e aprendizagem</h1><Tabs layout=\"sidebar\" defaultValue=\"Notas\"><TabsList aria-label=\"Secções académicas\">{sections.map(label=><TabsTrigger key={label} value={label}>{label}</TabsTrigger>)}</TabsList><TabsPanels>{sections.map(label=><TabsContent key={label} value={label}><section className=\"rounded-lg border p-5\"><h2 className=\"mb-4 text-lg\">{label}</h2><p className=\"mb-5 text-muted-foreground\">Ensaio visual com conteúdo controlado.</p><input aria-label=\"Pesquisa\" className=\"w-full rounded border p-2\" placeholder=\"Pesquisar nesta secção\"/><div className=\"mt-5 overflow-x-auto\"><table className=\"w-full text-left\"><thead><tr><th>Aluno</th><th>Disciplina</th><th>Média</th></tr></thead><tbody>{Array.from({length:18},(_,i)=><tr key={i} className=\"border-t\"><td className=\"py-3\">Aluno de exemplo {i+1}</td><td>Biologia</td><td>—</td></tr>)}</tbody></table></div></section></TabsContent>)}</TabsPanels></Tabs></main></div>);\n",
  );
  await writeFile(
    join(temporary, "fixture.css"),
    `@import "${repoRoot}src/styles.css";\n@source "./main.tsx";`,
  );
  server = await createServer({
    configFile: false,
    root: temporary,
    plugins: [react(), tailwind()],
    resolve: { alias: { "@": join(repoRoot, "src") } },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [repoRoot, temporary, await realpath(join(repoRoot, "node_modules"))] },
    },
    publicDir: join(repoRoot, "public"),
  });
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [390, 767, 768, 1023, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    const list = page.getByRole("tablist", { name: "Secções académicas" });
    await list.waitFor();
    await page.getByRole("tab", { name: "Notas", exact: true }).focus();
    const listBox = await list.boundingBox();
    const panel = await page.getByRole("tabpanel", { name: "Notas", exact: true }).boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error("Page overflow at " + width);
    if (width >= 1024 && panel.x < listBox.x + listBox.width)
      throw new Error("Panel not right of menu at " + width);
    if (width < 1024 && panel.y < listBox.y + listBox.height)
      throw new Error("Panel overlaps menu at " + width);
    await page.getByRole("tab", { name: "Horários", exact: true }).click();
    await page.getByRole("tabpanel", { name: "Horários", exact: true }).waitFor();
    if (width === 1440) {
      await page.getByRole("tab", { name: "Horários", exact: true }).focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(250);
      const selected = await page
        .getByRole("tab", { name: "Salas & Espaços", exact: true })
        .getAttribute("aria-selected");
      if (selected !== "true") throw new Error("Keyboard navigation failed");
    }
    console.log(
      JSON.stringify({
        width,
        overflow,
        menuWidth: listBox.width,
        position: width >= 1024 ? "left" : "above",
      }),
    );
  }
  console.log("browserErrors", errors);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page
    .getByRole("tab", {
      name: "NomeInstitucionalMuitoLongoSemEspaçosParaTestarQuebraDeLinha",
      exact: true,
    })
    .focus();
  const fits = await page
    .getByRole("tablist", { name: "Secções académicas" })
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  if (!fits) throw new Error("Long label overflows navigation");
  console.log("dark/reduced-motion/long-label: pass");
  if (errors.length) throw new Error(errors.join("\n"));

  await page.getByRole("tab", { name: "Notas", exact: true }).click();
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await page.waitForTimeout(300);
    const result = await page.getByRole("tab", { name: "Notas", exact: true }).evaluate((el) => {
      function rgb(color) {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const ctx = c.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) => (i === 3 ? v / 255 : v / 255));
      }
      const chain = [];
      for (let node = el; node; node = node.parentElement) chain.unshift(node);
      let bg = [1, 1, 1];
      for (const node of chain) {
        const color = rgb(getComputedStyle(node).backgroundColor);
        bg = bg.map((v, i) => color[i] * color[3] + v * (1 - color[3]));
      }
      const fg = rgb(getComputedStyle(el).color);
      const text = bg.map((v, i) => fg[i] * fg[3] + v * (1 - fg[3]));
      const lum = (rgb) =>
        rgb
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((v, n, i) => v + n * [0.2126, 0.7152, 0.0722][i], 0);
      const a = lum(text),
        b = lum(bg);
      return {
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        color: getComputedStyle(el).color,
        bg,
      };
    });
    console.log({ dark, ...result });
    if (result.ratio < 4.5) throw new Error("Active text contrast failed");
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
