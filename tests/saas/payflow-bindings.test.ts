import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAYFLOW_D1_DATABASE_ID,
  PLACEHOLDER_D1_DATABASE_ID,
  applyPayflowProductionBindings,
} from "../../scripts/siga/payflow-bindings.mjs";

const built = {
  name: "siga-plus-payflow",
  main: "index.js",
  d1_databases: [
    { binding: "DB", database_name: "site-creator-d1", database_id: PLACEHOLDER_D1_DATABASE_ID },
  ],
  r2_buckets: [{ binding: "TRANSFER_PROOFS", bucket_name: "site-creator-r2" }],
};

describe("PayFlow: ligações de produção", () => {
  it("liga a base D1 de produção, com as migrações do drizzle", () => {
    const cfg = applyPayflowProductionBindings(built, { migrationsDir: "../../drizzle", env: {} });
    expect(cfg.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: "siga-payflow",
        database_id: PAYFLOW_D1_DATABASE_ID,
        migrations_dir: "../../drizzle",
      },
    ]);
    expect(cfg.name).toBe("siga-plus-payflow");
  });

  it("sem PAYFLOW_R2_BUCKET não liga o R2 (ainda não activo na conta)", () => {
    const cfg = applyPayflowProductionBindings(built, { migrationsDir: "d", env: {} });
    expect(cfg.r2_buckets).toEqual([]);
    const withBucket = applyPayflowProductionBindings(built, {
      migrationsDir: "d",
      env: { PAYFLOW_R2_BUCKET: "siga-payflow-proofs" },
    });
    expect(withBucket.r2_buckets).toEqual([
      { binding: "TRANSFER_PROOFS", bucket_name: "siga-payflow-proofs" },
    ]);
  });

  it("recusa o id de desenvolvimento", () => {
    expect(() =>
      applyPayflowProductionBindings(built, {
        migrationsDir: "d",
        env: { PAYFLOW_D1_DATABASE_ID: PLACEHOLDER_D1_DATABASE_ID },
      }),
    ).toThrow(/desenvolvimento/);
  });

  it("o deploy aplica as migrações e deixa de apagar as ligações", () => {
    const script = readFileSync(join(process.cwd(), "scripts/deploy-all.mjs"), "utf8");
    expect(script).not.toMatch(/d1_databases\s*=\s*\[\]/);
    expect(script).toMatch(/applyPayflowProductionBindings/);
    expect(script).toMatch(/wrangler d1 migrations apply/);
    // Migrações antes do deploy do Worker: código novo nunca corre sobre esquema velho.
    expect(script.indexOf("d1 migrations apply")).toBeLessThan(
      script.indexOf('"npx wrangler deploy --config wrangler.json"'),
    );
  });

  it("as migrações do PayFlow são ficheiros .sql no topo de drizzle/ (formato do wrangler)", () => {
    const files = readdirSync(join(process.cwd(), "painel/payflow/drizzle")).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files).toContain("0000_yellow_lizard.sql");
  });
});
