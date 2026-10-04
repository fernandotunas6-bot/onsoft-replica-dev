import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { REQUIRED_WORKER_SECRETS } from "../../scripts/worker-secrets.mjs";

/**
 * O deploy de produção falhou de #49 a #53 sem que nada chegasse à Cloudflare:
 * faltava CLOUDFLARE_API_TOKEN no ambiente `production` e só o wrangler o dizia,
 * a meio da publicação. O primeiro passo do job confirma agora os segredos
 * obrigatórios. Este teste mantém essa lista igual ao que os scripts exigem.
 */

const REPO = resolve(__dirname, "../..");
type Step = { name?: string; run?: string; env?: Record<string, string> };
const workflow = load(
  readFileSync(resolve(REPO, ".github/workflows/deploy-production.yml"), "utf8"),
) as { jobs: { deploy: { steps: Step[] } } };
const steps = workflow.jobs.deploy.steps;
const preflight = steps.find((s) => s.name?.startsWith("Confirmar segredos"));

const checked = new Set(
  (preflight?.run?.match(/for name in ([A-Z_ ]+); do/)?.[1] ?? "").split(" ").filter(Boolean),
);

describe("verificação de segredos antes de publicar", () => {
  it("é o primeiro passo do job de publicação", () => {
    expect(preflight).toBeDefined();
    expect(steps.indexOf(preflight!)).toBe(0);
  });

  it("confirma tudo o que deploy-cf.mjs exige e o token do wrangler", () => {
    const deployCf = readFileSync(resolve(REPO, "scripts/deploy-cf.mjs"), "utf8");
    const required = [
      ...[...deployCf.matchAll(/requireEnv\("([A-Z_]+)"\)/g)].map((m) => m[1]!),
      ...REQUIRED_WORKER_SECRETS,
      "CLOUDFLARE_API_TOKEN",
    ];
    expect(required.length).toBeGreaterThan(1);
    for (const name of required) expect(checked, name).toContain(name);
  });

  it("cada nome verificado chega ao passo vindo dos segredos, igual à publicação", () => {
    const publish = steps.find((s) => s.run?.includes("deploy-all.mjs"));
    for (const name of checked) {
      expect(preflight?.env?.[name], name).toMatch(new RegExp(`^\\$\\{\\{ secrets\\.${name}\\b`));
      // O passo que confirma e o que publica lêem o mesmo valor (incluindo recursos).
      expect(publish?.env?.[name], name).toBe(preflight?.env?.[name]);
    }
  });

  it("nunca escreve valores, só nomes", () => {
    expect(preflight?.run).not.toMatch(/echo[^\n]*\$\{!name\}/);
    expect(preflight?.run).not.toMatch(/set -x/);
  });
});
