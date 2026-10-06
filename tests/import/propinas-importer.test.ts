import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propinasImporter } from "@/features/import/importers/propinas-importer";
import { IMPORTER_TARGET_TABLES } from "@/features/import/engine/governance";

/**
 * Importação de «propinas»:
 *  - regras activas de cobrança (school_settings, domínio billing), só o que vem no
 *    ficheiro (2026-10-04). Antes gravava em school_billing_settings, que nada lê, e sem
 *    a coluna da multa gravava 10 %;
 *  - o preço da propina de cada classe no plano activo (fee_items.grade_level_id,
 *    2026-10-05), a partir do modelo oficial.
 */

type Row = Record<string, unknown>;

/**
 * Base em memória com as cadeias que o importador e updateSettingsDomainValue usam.
 * `missingGradeColumn`: a base antes de SIGA_aplicar_propina_por_classe.sql.
 */
function fakeDb(
  initial: Record<string, Row[]> = {},
  options: { missingGradeColumn?: boolean } = {},
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const writes: string[] = [];
  let sequence = 0;
  const missingColumn = {
    code: "42703",
    message: "column fee_items.grade_level_id does not exist",
  };
  const client = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: Array<[string, unknown]> = [];
      let pending: { op: "update"; patch: Row } | { op: "insert"; row: Row } | null = null;
      let failure: typeof missingColumn | null = null;
      const match = () => rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      const settle = () => {
        if (failure) return { data: null, error: failure };
        if (pending?.op === "insert") return { data: [pending.row], error: null };
        if (pending?.op === "update") {
          const hit = match();
          for (const row of hit) Object.assign(row, pending.patch);
          return { data: hit.map((row) => ({ id: row.id })), error: null };
        }
        return { data: match(), error: null };
      };
      const chain = {
        select: (columns?: string) => {
          if (
            options.missingGradeColumn &&
            table === "fee_items" &&
            columns?.includes("grade_level_id")
          ) {
            failure = missingColumn;
          }
          return chain;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => {
          const { data, error } = settle();
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
        },
        single: async () => {
          const { data, error } = settle();
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
        },
        update: (patch: Row) => {
          writes.push(`update ${table}`);
          pending = { op: "update", patch };
          return chain;
        },
        insert: (row: Row) => {
          if (options.missingGradeColumn && table === "fee_items" && "grade_level_id" in row) {
            failure = {
              code: "PGRST204",
              message:
                "Could not find the 'grade_level_id' column of 'fee_items' in the schema cache",
            };
            return chain;
          }
          writes.push(`insert ${table}`);
          const created = { id: `${table}-${++sequence}`, ...row };
          rows.push(created);
          pending = { op: "insert", row: created };
          return chain;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(settle()).then(resolve, reject),
      };
      return chain;
    },
  };
  return { client, tables, writes };
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

/** Uma escola com plano activo, a 10ª Classe em dois cursos e a 7ª no ensino geral. */
function schoolWithPlan() {
  return {
    fee_plans: [{ id: "plan-1", school_id: "school-1", status: "active" }],
    grade_levels: [
      {
        id: "g10-cfb",
        school_id: "school-1",
        name: "10ª Classe",
        code: "10",
        program_id: "p-cfb",
        is_active: true,
      },
      {
        id: "g10-cej",
        school_id: "school-1",
        name: "10ª Classe",
        code: "10",
        program_id: "p-cej",
        is_active: true,
      },
      {
        id: "g7",
        school_id: "school-1",
        name: "7ª Classe",
        code: "7",
        program_id: "p-geral",
        is_active: true,
      },
      // De outra escola: nunca serve.
      {
        id: "g13-x",
        school_id: "school-2",
        name: "13ª Classe",
        code: "13",
        program_id: "p-x",
        is_active: true,
      },
    ],
    programs: [
      { id: "p-cfb", school_id: "school-1", name: "Ciências Físicas e Biológicas", code: "CFB" },
      { id: "p-cej", school_id: "school-1", name: "Ciências Económicas e Jurídicas", code: "CEJ" },
      { id: "p-geral", school_id: "school-1", name: "Ensino Geral", code: "EG" },
    ],
    fee_items: [
      {
        id: "item-geral",
        school_id: "school-1",
        fee_plan_id: "plan-1",
        code: "TUITION",
        kind: "tuition",
        amount: 25000,
        is_active: true,
        grade_level_id: null,
      },
    ],
  };
}

const officialRow = {
  title: "Propina Mensal - 10ª Classe",
  grade_level: "10ª Classe",
  course: "CFB",
  amount: "35.000,00",
  due_day: 10,
  penalty_rate: 1.5,
};

describe("importação de propinas → regras activas de cobrança", () => {
  it("muda só o que vem no ficheiro: a multa e o âmbito já definidos ficam", async () => {
    const { client, tables, writes } = fakeDb({
      school_settings: [
        {
          id: "r1",
          school_id: "school-1",
          domain: "billing",
          version: 1,
          value: {
            due_day: 10,
            late_fee_percent: 2,
            grace_days: 5,
            late_fee_scope: "electronic",
            sibling_discount_percent: 10,
          },
        },
      ],
    });
    const result = await propinasImporter.commitRow({ due_day: 5 }, ctx(client), {
      hasBillingRules: true,
    } as never);
    expect(result.status).toBe("imported");
    expect(writes).toEqual(["update school_settings"]);
    expect(tables.school_settings![0]!.value).toEqual({
      due_day: 5,
      late_fee_percent: 2,
      grace_days: 5,
      late_fee_scope: "electronic",
      sibling_discount_percent: 10,
    });
    expect(tables.school_settings![0]!.version).toBe(2);
  });

  it("uma linha sem regras de cobrança nem preço de classe é erro", () => {
    const analysis = propinasImporter.analyzeRow({ title: "Almoço" }, {} as never);
    expect(analysis.status).toBe("error");
    expect(analysis.errors.join(" ")).toMatch(/não traz regras de cobrança/);
  });

  it("no ensaio (dry run) não grava nada", async () => {
    const { client, writes } = fakeDb();
    const result = await propinasImporter.commitRow({ due_day: 5 }, ctx(client, true), {
      hasBillingRules: true,
    } as never);
    expect(result.status).toBe("will_update");
    expect(writes).toEqual([]);
  });
});

describe("importação de propinas → preço por classe", () => {
  it("o modelo oficial grava o preço da classe e o dia limite, sem inventar multa", async () => {
    const { client, tables, writes } = fakeDb(schoolWithPlan());
    const cache = await propinasImporter.loadRefCache(ctx(client));
    expect(cache).toMatchObject({ planId: "plan-1", hasBillingRules: false, gradePricing: true });

    const analysis = propinasImporter.analyzeRow(officialRow, cache);
    expect(analysis.status).toBe("warning");
    expect(analysis.warnings.join(" ")).toMatch(/taxa de multa diária não é aplicada/);

    const result = await propinasImporter.commitRow(officialRow, ctx(client), cache);
    expect(result.status).toBe("imported");
    expect(writes).toEqual(["insert school_settings", "insert fee_items"]);
    expect(tables.school_settings![0]!.value).toMatchObject({
      due_day: 10,
      late_fee_percent: 0,
      grace_days: 0,
    });
    expect(tables.fee_items).toHaveLength(2);
    expect(tables.fee_items![1]).toMatchObject({
      school_id: "school-1",
      fee_plan_id: "plan-1",
      grade_level_id: "g10-cfb",
      code: "TUITION-g10-cfb",
      kind: "tuition",
      frequency: "monthly",
      amount: 35000,
      is_active: true,
      name: "Propina Mensal - 10ª Classe",
    });
    // O preço geral fica como estava.
    expect(tables.fee_items![0]).toMatchObject({ id: "item-geral", amount: 25000 });
  });

  it("um segundo ficheiro actualiza o preço da mesma classe, sem duplicar", async () => {
    const { client, tables, writes } = fakeDb(schoolWithPlan());
    const row = { grade_level: "7ª Classe", amount: 18000 };
    const cache = await propinasImporter.loadRefCache(ctx(client));
    expect((await propinasImporter.commitRow(row, ctx(client, true), cache)).status).toBe(
      "will_insert",
    );
    await propinasImporter.commitRow(row, ctx(client), cache);

    // Nova importação (cache relida): a classe já tem item, por isso o ensaio diz actualizar.
    const again = await propinasImporter.loadRefCache(ctx(client));
    const next = { grade_level: "7ª classe", amount: "19.500" };
    expect((await propinasImporter.commitRow(next, ctx(client, true), again)).status).toBe(
      "will_update",
    );
    expect((await propinasImporter.commitRow(next, ctx(client), again)).status).toBe("imported");
    const seventh = tables.fee_items!.filter((item) => item.grade_level_id === "g7");
    expect(seventh).toHaveLength(1);
    expect(seventh[0]).toMatchObject({
      amount: 19500,
      is_active: true,
      name: "Propina mensal — 7ª Classe",
    });
    expect(writes).toEqual(["insert fee_items", "update fee_items"]);
  });

  it("classe desconhecida, de outra escola, ou repetida em dois cursos sem curso indicado, é erro", async () => {
    const { client } = fakeDb(schoolWithPlan());
    const cache = await propinasImporter.loadRefCache(ctx(client));
    const errorsOf = (row: Row) => propinasImporter.analyzeRow(row, cache).errors.join(" ");

    expect(errorsOf({ grade_level: "13ª Classe", amount: 1000 })).toMatch(
      /Classe «13ª Classe» não encontrada nesta escola/,
    );
    expect(errorsOf({ grade_level: "10ª Classe", amount: 1000 })).toMatch(
      /existe em mais de um curso: indique o curso/,
    );
    expect(errorsOf({ grade_level: "10ª Classe", course: "Todos", amount: 1000 })).toMatch(
      /mais de um curso/,
    );
    expect(errorsOf({ grade_level: "10ª Classe", course: "XYZ", amount: 1000 })).toMatch(
      /Curso «XYZ» não encontrado nesta escola/,
    );
    // Pelo nome ou pelo código do curso, sem acentos nem maiúsculas a contar.
    expect(
      propinasImporter.analyzeRow(
        { grade_level: "10ª Classe", course: "ciencias economicas e juridicas", amount: 1000 },
        cache,
      ).status,
    ).toBe("valid");
    expect(
      propinasImporter.analyzeRow({ classe: "10", curso: "cej", valor: 1000 }, cache).status,
    ).toBe("valid");
  });

  it("preço sem valor, sem classe ou sem plano activo é erro", async () => {
    const { client } = fakeDb(schoolWithPlan());
    const cache = await propinasImporter.loadRefCache(ctx(client));
    expect(
      propinasImporter.analyzeRow({ grade_level: "7ª Classe", amount: 0 }, cache).errors.join(" "),
    ).toMatch(/Indique o valor mensal da propina/);
    expect(propinasImporter.analyzeRow({ amount: 1000 }, cache).errors.join(" ")).toMatch(
      /Indique a classe/,
    );

    const { client: noPlan } = fakeDb({ ...schoolWithPlan(), fee_plans: [] });
    const withoutPlan = await propinasImporter.loadRefCache(ctx(noPlan));
    const analysis = propinasImporter.analyzeRow(
      { grade_level: "7ª Classe", amount: 1000 },
      withoutPlan,
    );
    expect(analysis.status).toBe("error");
    expect(analysis.errors.join(" ")).toMatch(/Active primeiro o plano de propinas/);
    // As regras de cobrança, sozinhas, não precisam do plano.
    expect(propinasImporter.analyzeRow({ due_day: 5 }, withoutPlan).status).toBe("valid");
  });

  it("sem o pacote SQL aplicado, o preço é recusado logo na pré-visualização", async () => {
    const { client, writes } = fakeDb(schoolWithPlan(), { missingGradeColumn: true });
    const cache = await propinasImporter.loadRefCache(ctx(client));
    expect(cache).toMatchObject({ gradePricing: false });
    const analysis = propinasImporter.analyzeRow(officialRow, cache);
    expect(analysis.status).toBe("error");
    expect(analysis.errors.join(" ")).toMatch(/SIGA_aplicar_propina_por_classe\.sql/);
    const result = await propinasImporter.commitRow(officialRow, ctx(client), cache);
    expect(result.status).toBe("error");
    expect(writes).toEqual([]);

    // Se a pré-visualização não souber (cache antiga), a gravação dá a mesma mensagem.
    const stale = { ...cache, gradePricing: undefined };
    const late = await propinasImporter.commitRow(
      { grade_level: "7ª Classe", amount: 1000 },
      ctx(client),
      stale,
    );
    expect(late.status).toBe("error");
    expect(late.errors.join(" ")).toMatch(/SIGA_aplicar_propina_por_classe\.sql/);
  });
});

describe("importação de propinas: limites", () => {
  it("só a importação de propinas tem school_settings como destino, e com os preços das classes", () => {
    const withSettings = Object.entries(IMPORTER_TARGET_TABLES)
      .filter(([, tables]) => tables.includes("school_settings"))
      .map(([module]) => module);
    expect(withSettings).toEqual(["propinas"]);
    expect(IMPORTER_TARGET_TABLES.propinas).toEqual(["school_settings", "fee_items"]);
  });

  it("escreve só o domínio billing (gravação versionada do ecrã) e os itens de propina", () => {
    const source = readFileSync("src/features/import/importers/propinas-importer.ts", "utf8");
    expect(source).toMatch(/updateSettingsDomainValue\(\s*ctx\.db,\s*ctx\.schoolId,\s*"billing",/);
    const writes = [
      ...source.matchAll(/\.from\("([a-z_]+)"\)\s*\.(insert|update|upsert|delete)\(/g),
    ].map((match) => `${match[2]} ${match[1]}`);
    expect(writes).toEqual(["update fee_items", "insert fee_items"]);
    // A actualização é sempre do item desta escola; nunca se apagam itens (as faturas ligam-se a eles).
    expect(source).toMatch(
      /\.update\(\{ amount: price\.amount, name, is_active: true \}\)\s*\.eq\("school_id", ctx\.schoolId\)/,
    );
    expect(source).not.toMatch(/\.(upsert|delete)\(/);
    expect(source).not.toContain('school_billing_settings")');
  });

  it("gravar as regras pela importação pede 2FA, como no ecrã", () => {
    const server = readFileSync("src/features/import/server.ts", "utf8");
    expect(server).toMatch(
      /if \(job\.module === "propinas" && !data\.dry_run\) \{\s*requireAal2\(context\.claims,/,
    );
  });
});
