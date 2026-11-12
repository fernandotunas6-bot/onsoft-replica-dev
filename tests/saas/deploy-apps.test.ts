import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPLOY_APPS,
  assertWranglerLoginAllowed,
  selectDeployApps,
  usesWranglerLogin,
} from "../../scripts/siga/deploy-apps.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("vias de deploy: escolher apps e publicar sem API token", () => {
  it("por omissão (vazio ou all) publica todas as apps", () => {
    for (const raw of [undefined, "", "all", " ALL "]) {
      expect([...selectDeployApps(raw)]).toEqual(DEPLOY_APPS);
    }
  });

  it("aceita uma lista com vírgulas ou espaços, sem distinguir maiúsculas", () => {
    expect([...selectDeployApps("siga, PayFlow")]).toEqual(["siga", "payflow"]);
    expect([...selectDeployApps("web admin")]).toEqual(["web", "admin"]);
  });

  it("um nome errado recusa antes de publicar, em vez de não publicar nada com sucesso", () => {
    expect(() => selectDeployApps("siga,sigaa")).toThrow(/desconhecida \(sigaa\)/);
  });

  it("o modo wrangler login é só para a máquina de quem publica, nunca no CI", () => {
    expect(usesWranglerLogin({ SIGA_DEPLOY_AUTH: "wrangler-login" })).toBe(true);
    expect(usesWranglerLogin({})).toBe(false);
    expect(() =>
      assertWranglerLoginAllowed({ SIGA_DEPLOY_AUTH: "wrangler-login", GITHUB_ACTIONS: "true" }),
    ).toThrow(/nunca no CI/);
    expect(() => assertWranglerLoginAllowed({ SIGA_DEPLOY_AUTH: "wrangler-login" })).not.toThrow();
  });

  it("cada passo de deploy-all.mjs pertence a uma app da lista, e todas têm passo", () => {
    const script = read("scripts/deploy-all.mjs");
    const steps = [...script.matchAll(/runStep\("([a-z]+)",/g)].map((m) => m[1]);
    expect(steps.sort()).toEqual([...DEPLOY_APPS].sort());
  });

  it("o «Run workflow» escolhe apps; o push para a main publica tudo", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    expect(workflow).toMatch(/workflow_dispatch:\n(?:\s+#.*\n)*\s+inputs:\n\s+apps:/);
    expect(workflow).toContain("SIGA_DEPLOY_APPS: ${{ inputs.apps || 'all' }}");
  });

  it("sem token, deploy-cf.mjs tira do ambiente do wrangler qualquer token velho", () => {
    const script = read("scripts/deploy-cf.mjs");
    expect(script).toMatch(/WRANGLER_LOGIN \? "" : requireEnv\("CLOUDFLARE_API_TOKEN"\)/);
    expect(script).toContain("else delete cfEnv.CLOUDFLARE_API_TOKEN;");
  });

  it("a versão publicada vai nas vars do Worker e volta no cabeçalho x-siga-release", () => {
    const deployCf = read("scripts/deploy-cf.mjs");
    expect(deployCf).toContain("SIGA_RELEASE_SHA: RELEASE_SHA");
    const server = read("src/server.ts");
    expect(server).toContain('target.headers.set("x-siga-release", release)');
    // Só um SHA (opcionalmente «-dirty»): nada vindo de fora vai para o cabeçalho.
    expect(server).toContain("/^[0-9a-f]{40}(?:-dirty)?$/");
  });
});
