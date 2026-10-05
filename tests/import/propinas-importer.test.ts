import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propinasImporter } from "@/features/import/importers/propinas-importer";
import { IMPORTER_TARGET_TABLES } from "@/features/import/engine/governance";

/**
 * Importação de «propinas» (2026-10-04): grava as regras activas de cobrança
 * (school_settings, domínio billing), só o que vem no ficheiro. Antes gravava em
 * school_billing_settings, que nada lê, e sem a coluna da multa gravava 10 %.
 */

type Row = { id: string; school_id: string; domain: string; version: number; value: unknown };

/** school_settings em memória, com a cadeia que updateSettingsDomainValue usa. */
function settingsDb(initial?: Record<string, unknown>) {
  const rows: Row[] = initial
    ? [{ id: "r1", school_id: "school-1", domain: "billing", version: 1, value: initial }]
    : [];
  const writes: string[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let pending: { op: "update"; patch: Partial<Row> } | null = null;
      const match = () =>
        rows.filter((row) =>
          Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value),
        );
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
        update: (patch: Partial<Row>) => {
          writes.push(`update ${table}`);
          pending = { op: "update", patch };
          return chain;
        },
        insert: async (row: Omit<Row, "id">) => {
          writes.push(`insert ${table}`);
          rows.push({ ...row, id: `r${rows.length + 1}` });
          return { error: null };
        },
        then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
          if (pending) {
            const hit = match();
            for (const row of hit) Object.assign(row, pending.patch);
            return resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
          }
          return resolve({ data: match(), error: null });
        },
      };
      return chain;
    },
  };
  return { client, rows, writes };
}

const ctx = (db: unknown, dryRun = false) =>
  ({
    db,
    sessionSupabase: db,
    schoolId: "school-1",
    academicYearId: "ay1",
    userId: "user-1",
    duplicateStrategy: "update",
    dryRun,
  }) as never;

describe("importação de propinas → regras activas de cobrança", () => {
  it("muda só o que vem no ficheiro: a multa e o âmbito já definidos ficam", async () => {
    const { client, rows, writes } = settingsDb({
      due_day: 10,
      late_fee_percent: 2,
      grace_days: 5,
      late_fee_scope: "electronic",
      sibling_discount_percent: 10,
    });
    const result = await propinasImporter.commitRow({ due_day: 5 }, ctx(client), {
      hasBillingRules: true,
    } as never);
    expect(result.status).toBe("imported");
    expect(writes).toEqual(["update school_settings"]);
    expect(rows[0]!.value).toEqual({
      due_day: 5,
      late_fee_percent: 2,
      grace_days: 5,
      late_fee_scope: "electronic",
      sibling_discount_percent: 10,
    });
    expect(rows[0]!.version).toBe(2);
  });

  it("o modelo oficial (preçário) não inventa multa: só o dia limite, com avisos", async () => {
    const { client, rows } = settingsDb();
    const row = {
      title: "Propina Mensal - 10ª Classe",
      grade_level: "10ª Classe",
      amount: 35000,
      due_day: 10,
      penalty_rate: 1.5,
    };
    const analysis = propinasImporter.analyzeRow(row, {} as never);
    expect(analysis.status).toBe("warning");
    expect(analysis.warnings.join(" ")).toMatch(/valores das propinas não são importados/);
    expect(analysis.warnings.join(" ")).toMatch(/taxa de multa diária não é aplicada/);
    const result = await propinasImporter.commitRow(row, ctx(client), {
      hasBillingRules: false,
    } as never);
    expect(result.status).toBe("imported");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toMatchObject({ due_day: 10, late_fee_percent: 0, grace_days: 0 });
  });

  it("uma linha sem regras de cobrança é erro", () => {
    const analysis = propinasImporter.analyzeRow({ title: "Almoço" }, {} as never);
    expect(analysis.status).toBe("error");
  });

  it("no ensaio (dry run) não grava nada", async () => {
    const { client, writes } = settingsDb({ due_day: 10 });
    const result = await propinasImporter.commitRow({ due_day: 5 }, ctx(client, true), {
      hasBillingRules: true,
    } as never);
    expect(result.status).toBe("will_update");
    expect(writes).toEqual([]);
  });
});

describe("importação de propinas: limites", () => {
  it("só a importação de propinas tem school_settings como destino", () => {
    const withSettings = Object.entries(IMPORTER_TARGET_TABLES)
      .filter(([, tables]) => tables.includes("school_settings"))
      .map(([module]) => module);
    expect(withSettings).toEqual(["propinas"]);
  });

  it("e só escreve o domínio billing, pela gravação versionada do ecrã", () => {
    const source = readFileSync("src/features/import/importers/propinas-importer.ts", "utf8");
    expect(source).toMatch(/updateSettingsDomainValue\(\s*ctx\.db,\s*ctx\.schoolId,\s*"billing",/);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toContain('school_billing_settings")');
  });

  it("gravar as regras pela importação pede 2FA, como no ecrã", () => {
    const server = readFileSync("src/features/import/server.ts", "utf8");
    expect(server).toMatch(
      /if \(job\.module === "propinas" && !data\.dry_run\) \{\s*requireAal2\(context\.claims,/,
    );
  });
});
