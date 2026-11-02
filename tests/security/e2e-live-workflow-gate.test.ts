import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { checkReleaseStagingEnvironment } from "../../scripts/siga/release-staging-preflight.mjs";

type Step = {
  name?: string;
  id?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
};
type LiveWorkflow = {
  on: { schedule?: unknown; workflow_dispatch?: unknown };
  jobs: {
    live: {
      environment?: string;
      steps: Step[];
    };
    notify: { if?: string };
  };
};

const workflow = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/ecosystem-e2e-live.yml"), "utf8"),
) as LiveWorkflow;
const steps = workflow.jobs.live.steps;
const gate = steps.find((step) => step.id === "secrets");

describe("E2E real nunca comunica sucesso quando staging está incompleto", () => {
  it("exige ambiente staging tanto no calendário como na execução manual", () => {
    expect(workflow.on.schedule).toBeDefined();
    expect(Object.hasOwn(workflow.on, "workflow_dispatch")).toBe(true);
    expect(workflow.jobs.live.environment).toBe("staging");
    expect(gate).toBeDefined();
    expect(steps.indexOf(gate!)).toBe(1);
  });

  it("falha explicitamente se faltar um segredo, sem marcação skip silenciosa", () => {
    const command = gate?.run ?? "";
    expect(command).toMatch(/if \[ "\$missing" -eq 1 \]; then/);
    expect(command).toContain("exit 1");
    expect(command).toContain("::error::");
    expect(command).toContain("$GITHUB_STEP_SUMMARY");
    expect(command).not.toContain('echo "skip=true"');
    expect(command).not.toContain('github.event_name');
    for (const name of [
      "STAGING_SUPABASE_PROJECT_ID",
      "STAGING_SUPABASE_URL",
      "STAGING_SUPABASE_PUBLISHABLE_KEY",
      "STAGING_SUPABASE_SECRET_KEY",
    ]) {
      expect(gate?.env?.[name]).toContain(`secrets.${name}`);
      expect(command).toContain(name);
    }
  });

  it("mantém o preflight independente antes de qualquer teste com escrita", () => {
    const preflight = steps.find((step) =>
      step.run?.includes("scripts/siga/release-staging-preflight.mjs"),
    );
    const live = steps.find((step) => step.run?.includes("e2e-ecosystem-live.mjs"));
    expect(preflight).toBeDefined();
    expect(live).toBeDefined();
    expect(steps.indexOf(preflight!)).toBeLessThan(steps.indexOf(live!));
    expect(preflight?.if).toContain("steps.secrets.outputs.skip");
  });

  it("mantém o aviso de falha quando o staging está ausente", () => {
    expect(workflow.jobs.notify.if).toContain("needs.live.result == 'failure'");
  });
});

const stagingFixture = {
  STAGING_SUPABASE_PROJECT_ID: "audittest",
  STAGING_SUPABASE_URL: "https://audittest.supabase.co",
  STAGING_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  STAGING_SUPABASE_SECRET_KEY: "fixture-secret",
};

describe("preflight do ambiente isolado — sem rede nem dados reais", () => {
  it("recusa configuração incompleta antes de executar testes autenticados", () => {
    expect(() =>
      checkReleaseStagingEnvironment({
        ...stagingFixture,
        STAGING_SUPABASE_SECRET_KEY: "",
      }),
    ).toThrow(/Staging incompleto/);
  });

  it("recusa a referência da produção mesmo com quatro campos preenchidos", () => {
    expect(() =>
      checkReleaseStagingEnvironment({
        ...stagingFixture,
        STAGING_SUPABASE_PROJECT_ID: "xodgfmxiaunpamctfeea",
        STAGING_SUPABASE_URL: "https://xodgfmxiaunpamctfeea.supabase.co",
      }),
    ).toThrow(/produção/);
  });

  it("aceita apenas projecto de staging consistente, sem abrir ligações", () => {
    expect(checkReleaseStagingEnvironment(stagingFixture).projectRef).toBe("audittest");
    expect(() =>
      checkReleaseStagingEnvironment({
        ...stagingFixture,
        STAGING_SUPABASE_URL: "https://outro.supabase.co",
      }),
    ).toThrow(/bloqueado/);
  });
});
