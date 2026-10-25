import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

type WorkflowStep = {
  name?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  "continue-on-error"?: boolean;
};

type StagingWorkflow = {
  jobs?: {
    live?: {
      environment?: string;
      steps?: WorkflowStep[];
    };
  };
};

const path = resolve(__dirname, "../../.github/workflows/ecosystem-e2e-live.yml");
const workflow = load(readFileSync(path, "utf8")) as StagingWorkflow;
const job = workflow.jobs?.live;
const steps = job?.steps ?? [];

describe("workflow E2E autenticado de staging", () => {
  it("recusa transformar falta de staging em CI verde por omissão", () => {
    expect(job?.environment).toBe("staging");
    expect(steps.length).toBeGreaterThan(5);
    expect(
      steps.some((step) =>
        /skip=true|steps\.secrets\.outputs\.skip|continue-on-error/.test(JSON.stringify(step)),
      ),
    ).toBe(false);
  });

  it("valida o destino antes de instalar dependências ou iniciar o ecossistema", () => {
    const guardIndex = steps.findIndex((step) =>
      step.run?.includes("node scripts/siga/check-staging-readiness.mjs"),
    );
    const installIndex = steps.findIndex((step) => step.run?.includes("bun install"));
    const startIndex = steps.findIndex((step) =>
      step.run?.includes("node scripts/siga/start-ecosystem-ci.mjs"),
    );
    const e2eIndex = steps.findIndex((step) =>
      step.run?.includes("node scripts/siga/e2e-ecosystem-live.mjs"),
    );

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThan(guardIndex);
    expect(startIndex).toBeGreaterThan(installIndex);
    expect(e2eIndex).toBeGreaterThan(startIndex);

    const guard = steps[guardIndex];
    expect(guard.if).toBeUndefined();
    expect(guard["continue-on-error"]).toBeUndefined();
    for (const secret of [
      "STAGING_SUPABASE_PROJECT_ID",
      "STAGING_SUPABASE_URL",
      "STAGING_SUPABASE_PUBLISHABLE_KEY",
      "STAGING_SUPABASE_SECRET_KEY",
    ]) {
      expect(guard.env?.[secret]).toContain(`secrets.${secret}`);
    }
    expect(steps[e2eIndex].if).toBeUndefined();
    expect(steps[e2eIndex]["continue-on-error"]).toBeUndefined();
  });
});
