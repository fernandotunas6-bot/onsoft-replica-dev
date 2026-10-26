import { expect, test, type Page } from "@playwright/test";

/**
 * SIGA Context Engine — cenários de aceitação A a F (§17 do Prompt Master), só
 * de leitura, com sessões EXISTENTES de staging. Não cria, altera nem apaga nada.
 *
 * Opt-in: SIGA_CONTEXT_E2E=1, um servidor local da app ligado ao Supabase de
 * staging (SIGA_CONTEXT_PROJECT_REF, nunca o de produção) e uma sessão gravada por
 * papel (SIGA_CONTEXT_STATE_PROFESSOR, _SECRETARIA, _ALUNO). Os ids vêm do
 * ambiente; cada cenário salta quando os seus não estão definidos:
 *
 * - SIGA_CONTEXT_TURMA, SIGA_CONTEXT_DISCIPLINA: uma disciplina que o professor dá.
 * - SIGA_CONTEXT_TAREFA: um trabalho dessa disciplina.
 * - SIGA_CONTEXT_TURMA_ALHEIA: uma turma da escola que o professor NÃO lecciona.
 * - SIGA_CONTEXT_ALUNO: um aluno da escola (ficha aberta pela secretaria).
 * - SIGA_CONTEXT_ALUNO_OUTRA_ESCOLA: um aluno de outra escola (cenários D e F).
 *
 * Sem capturas, traces nem vídeos: os ecrãs têm dados de alunos.
 */
const env = (name: string) => process.env[name]?.trim() || undefined;
const enabled = env("SIGA_CONTEXT_E2E") === "1";
const ids = {
  turma: env("SIGA_CONTEXT_TURMA"),
  disciplina: env("SIGA_CONTEXT_DISCIPLINA"),
  tarefa: env("SIGA_CONTEXT_TAREFA"),
  turmaAlheia: env("SIGA_CONTEXT_TURMA_ALHEIA"),
  aluno: env("SIGA_CONTEXT_ALUNO"),
  alunoOutraEscola: env("SIGA_CONTEXT_ALUNO_OUTRA_ESCOLA"),
};
const states = {
  professor: env("SIGA_CONTEXT_STATE_PROFESSOR"),
  secretaria: env("SIGA_CONTEXT_STATE_SECRETARIA"),
  aluno: env("SIGA_CONTEXT_STATE_ALUNO"),
};

if (enabled) {
  const app = new URL(process.env.VITE_SIGA_URL ?? "http://localhost:3006");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) || app.username) {
    throw new Error("Context Engine E2E: executar apenas contra um servidor local.");
  }
  // Um frontend local pode estar ligado ao Supabase de produção: recusar antes de abrir sessões.
  const ref = env("SIGA_CONTEXT_PROJECT_REF");
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!ref || ref === "xodgfmxiaunpamctfeea" || !supabaseUrl) {
    throw new Error("Context Engine E2E: confirmar o projecto e o URL do Supabase de staging.");
  }
  const database = new URL(supabaseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname);
  if (
    (ref === "local" ? !local : database.hostname !== `${ref}.supabase.co`) ||
    database.username
  ) {
    throw new Error("Context Engine E2E: Supabase de produção ou destino inesperado.");
  }
}

// Sem gravações automáticas: os ecrãs têm dados de alunos.
test.use({ screenshot: "off", trace: "off", video: "off" });
const emptyState = { cookies: [], origins: [] };

/** O menu da entidade na sidebar (`ContextEntityNav`): «Turma: 10.ª A», «Aluno: Ana»… */
const entityMenu = (page: Page, kind: string) =>
  page.getByRole("region", { name: new RegExp(`^${kind}: `) });

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#conteudo-principal")).toBeVisible();
}

test.describe("Context Engine — professor (A, E, F)", () => {
  test.skip(!enabled || !states.professor, "Requer SIGA_CONTEXT_E2E=1 e a sessão do professor.");
  test.use({ storageState: states.professor ?? emptyState });

  test("A: turma → disciplina → trabalhos → entregas → regressa sem misturar turmas", async ({
    page,
  }) => {
    test.skip(!ids.turma || !ids.disciplina, "Defina SIGA_CONTEXT_TURMA e _DISCIPLINA.");
    await open(
      page,
      `/pedagogica?tab=notas&turma=${ids.turma}&disciplina=${ids.disciplina}&pauta=1`,
    );
    const subject = entityMenu(page, "Disciplina");
    await expect(subject).toBeVisible();
    await subject.getByRole("link", { name: "Trabalhos" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/pedagogica/trabalhos\\?.*disciplina=${ids.disciplina}`),
    );
    await expect(page).toHaveURL(new RegExp(`turma=${ids.turma}`));
    if (ids.turmaAlheia) {
      await expect(page.locator("[data-context-nav]")).not.toContainText(ids.turmaAlheia);
    }

    test.skip(!ids.tarefa, "Defina SIGA_CONTEXT_TAREFA para abrir as entregas.");
    await open(page, `/pedagogica/tarefas/${ids.tarefa}`);
    const task = entityMenu(page, "Trabalho");
    await expect(task).toBeVisible();
    await task.getByRole("link", { name: "Por entregar" }).click();
    await expect(page).toHaveURL(/estado=por-entregar/);
    await expect(task.getByRole("link", { name: "Por entregar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await task.getByRole("link", { name: /^Voltar/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/pedagogica/trabalhos\\?.*disciplina=${ids.disciplina}`),
    );
  });

  test("E: um link directo profundo restaura o menu e a função activa", async ({ page }) => {
    test.skip(!ids.turma || !ids.disciplina, "Defina SIGA_CONTEXT_TURMA e _DISCIPLINA.");
    await open(page, `/pedagogica?tab=presencas&turma=${ids.turma}&disciplina=${ids.disciplina}`);
    const subject = entityMenu(page, "Disciplina");
    await expect(subject).toBeVisible();
    await expect(subject.getByRole("link", { name: "Presenças" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("F: uma turma que o professor não lecciona não abre contexto", async ({ page }) => {
    test.skip(!ids.turmaAlheia, "Defina SIGA_CONTEXT_TURMA_ALHEIA.");
    await open(page, `/pedagogica?tab=notas&turma=${ids.turmaAlheia}`);
    await expect(page.locator("[data-context-nav]")).toHaveCount(0);
  });
});

test.describe("Context Engine — secretaria (C, D, F)", () => {
  test.skip(!enabled || !states.secretaria, "Requer SIGA_CONTEXT_E2E=1 e a sessão da secretaria.");
  test.use({ storageState: states.secretaria ?? emptyState });

  test("C: aluno → documentos → financeiro → regressa à ficha, sempre o mesmo aluno", async ({
    page,
  }) => {
    test.skip(!ids.aluno, "Defina SIGA_CONTEXT_ALUNO.");
    await open(page, `/alunos/${ids.aluno}`);
    const student = entityMenu(page, "Aluno");
    await expect(student).toBeVisible();
    const name = await student.getAttribute("aria-label");
    for (const section of ["documentos", "financeiro"]) {
      const link = student.locator(`a[href*="secao=${section}"]`).first();
      if ((await link.count()) === 0) continue; // a conta pode não ler essa secção
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/alunos/${ids.aluno}\\?.*secao=${section}`));
      await expect(entityMenu(page, "Aluno")).toHaveAttribute("aria-label", name ?? "");
    }
    await open(page, `/alunos/${ids.aluno}`);
    await expect(entityMenu(page, "Aluno")).toHaveAttribute("aria-label", name ?? "");
  });

  test("D/F: um aluno de outra escola pela URL não abre ficha nem menu", async ({ page }) => {
    test.skip(!ids.alunoOutraEscola, "Defina SIGA_CONTEXT_ALUNO_OUTRA_ESCOLA.");
    await open(page, `/alunos/${ids.alunoOutraEscola}`);
    await expect(page.locator("[data-context-nav]")).toHaveCount(0);
  });
});

test.describe("Context Engine — aluno (B)", () => {
  test.skip(!enabled || !states.aluno, "Requer SIGA_CONTEXT_E2E=1 e a sessão do aluno.");
  test.use({ storageState: states.aluno ?? emptyState });

  test("B: o aluno não recebe menus de gestão nem a ficha de outro aluno", async ({ page }) => {
    await open(page, "/pedagogica?tab=notas");
    await expect(page.locator("[data-context-nav]")).toHaveCount(0);
    test.skip(!ids.aluno, "Defina SIGA_CONTEXT_ALUNO (um colega, não o próprio).");
    await open(page, `/alunos/${ids.aluno}`);
    await expect(page.locator("[data-context-nav]")).toHaveCount(0);
  });
});
