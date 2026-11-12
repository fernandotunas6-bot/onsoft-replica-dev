import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS_PER_RUN,
  RETRY_AFTER_MS,
  decide,
  failureHint,
  isInSync,
  issueBody,
  parseRelease,
} from "../../scripts/siga/deploy-watchdog.mjs";

const MAIN = "a".repeat(40);
const OLD = "b".repeat(40);
const NOW = Date.parse("2026-10-30T12:00:00Z");
const longAgo = new Date(NOW - RETRY_AFTER_MS - 60_000).toISOString();
const justNow = new Date(NOW - 5 * 60_000).toISOString();

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    run_number: 307,
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    head_sha: MAIN,
    updated_at: longAgo,
    html_url: "https://github.com/x/y/actions/runs/1",
    ...overrides,
  };
}

const base = { mainSha: MAIN, now: NOW, event: "schedule", inSync: false };
const publish = { failedJob: "Publicar na Cloudflare" };

describe("vigilância do deploy contínuo", () => {
  it("lê só um SHA no cabeçalho, com ou sem -dirty", () => {
    expect(parseRelease(MAIN)).toEqual({ sha: MAIN, dirty: false });
    expect(parseRelease(`${MAIN}-dirty`)).toEqual({ sha: MAIN, dirty: true });
    for (const bad of [null, "", "abc", `${MAIN}x`, "<script>"])
      expect(parseRelease(bad)).toBeNull();
  });

  it("em dia: a mesma versão, ou diferença só em documentação; nunca com -dirty", () => {
    expect(
      isInSync({ release: { sha: MAIN, dirty: false }, mainSha: MAIN, changedFiles: [] }),
    ).toBe(true);
    expect(
      isInSync({
        release: { sha: OLD, dirty: false },
        mainSha: MAIN,
        changedFiles: ["docs/a.md", "painel/README.md"],
      }),
    ).toBe(true);
    expect(
      isInSync({ release: { sha: OLD, dirty: false }, mainSha: MAIN, changedFiles: ["src/a.ts"] }),
    ).toBe(false);
    expect(isInSync({ release: { sha: MAIN, dirty: true }, mainSha: MAIN, changedFiles: [] })).toBe(
      false,
    );
    expect(
      isInSync({ release: { sha: OLD, dirty: false }, mainSha: MAIN, changedFiles: null }),
    ).toBe(false);
  });

  it("produção em dia: fecha a issue, não repete nada", () => {
    expect(decide({ ...base, inSync: true, run: run() })).toEqual({ state: "ok", retry: null });
  });

  it("publicação a correr: espera por ela", () => {
    expect(decide({ ...base, run: run({ status: "in_progress", conclusion: null }) })).toEqual({
      state: "a-publicar",
      retry: null,
    });
  });

  it("publicar falhou e já passou o intervalo: repete só os jobs que falharam", () => {
    expect(decide({ ...base, ...publish, run: run() })).toEqual({
      state: "parado",
      retry: "rerun",
    });
  });

  it("não repete antes do intervalo, salvo pedido à mão", () => {
    expect(decide({ ...base, ...publish, run: run({ updated_at: justNow }) }).retry).toBeNull();
    expect(
      decide({ ...base, ...publish, event: "workflow_dispatch", run: run({ updated_at: justNow }) })
        .retry,
    ).toBe("rerun");
  });

  it("ao fim de muitas tentativas da mesma execução, pede uma execução nova", () => {
    expect(
      decide({ ...base, ...publish, run: run({ run_attempt: MAX_ATTEMPTS_PER_RUN }) }).retry,
    ).toBe("dispatch");
  });

  it("testes falhados não se repetem: são do código", () => {
    expect(decide({ ...base, failedJob: "Verificar antes de publicar", run: run() })).toEqual({
      state: "parado",
      retry: null,
    });
  });

  it("o aviso do fim de uma publicação só actualiza a issue (sem ciclo de repetições)", () => {
    expect(decide({ ...base, ...publish, event: "workflow_run", run: run() }).retry).toBeNull();
  });

  it("main com código por publicar e a última publicação noutro commit: pede uma nova", () => {
    expect(decide({ ...base, ...publish, run: run({ head_sha: OLD }) }).retry).toBe("dispatch");
    expect(decide({ ...base, run: run({ head_sha: OLD, conclusion: "success" }) }).retry).toBe(
      "dispatch",
    );
    expect(decide({ ...base, run: null }).retry).toBe("dispatch");
  });

  it("a issue diz o passo que falhou e o que corrigir, sem segredos", () => {
    expect(
      failureHint(
        "Publicar na Cloudflare",
        "Confirmar segredos obrigatórios do ambiente production",
      ),
    ).toMatch(/CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ACCOUNT_ID.*SUPABASE_SERVICE_ROLE_KEY/);
    expect(failureHint("Publicar na Cloudflare", "Confirmar o token da Cloudflare")).toMatch(
      /API Token novo/,
    );
    const body = issueBody({
      mainSha: MAIN,
      release: null,
      run: run(),
      failedJob: "Publicar na Cloudflare",
      failedStep: "Confirmar o token da Cloudflare",
      retry: "rerun",
      checkedAt: "2026-10-30 12:00 UTC",
    });
    expect(body).toContain("aaaaaaaaaaaa");
    expect(body).toContain("Publicar na Cloudflare → Confirmar o token da Cloudflare");
    expect(body).toContain("Voltei a correr os jobs que falharam.");
    expect(body).toContain("docs/releases/DEPLOY_VIAS.md");
  });

  it("o workflow corre de 2 em 2 horas e no fim de cada publicação, sem segredos de produção", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/deploy-watchdog.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/cron: "41 \*\/2 \* \* \*"/);
    expect(workflow).toMatch(/workflow_run:\n\s+workflows: \["Deploy produção"\]/);
    expect(workflow).toMatch(
      /permissions:\n\s+actions: write\n\s+contents: read\n\s+issues: write/,
    );
    expect(workflow).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
    expect(workflow).not.toMatch(/environment:/);
  });
});
