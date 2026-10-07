import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  feeItemMatcher,
  gradeTuitionCode,
  isMissingGradeColumn,
  pickFeeItem,
  toFeeItemRow,
  type FeeItemRow,
} from "@/features/finance/fee-items";
import { resolveFeeItemForPlan, type FeeItemRef } from "@/features/import/importers/finance-core";

/** Propina por classe (2026-10-05): fee_items.grade_level_id e a escolha do item. */

const item = (overrides: Partial<FeeItemRow>): FeeItemRow => ({
  id: "x",
  name: "Item",
  kind: "tuition",
  code: "TUITION",
  amount: 25000,
  is_active: true,
  grade_level_id: null,
  ...overrides,
});

const plan: FeeItemRow[] = [
  item({ id: "geral", code: "TUITION", amount: 25000 }),
  item({ id: "matricula", kind: "enrollment", code: "ENROLLMENT", amount: 15000 }),
  item({ id: "g10", code: gradeTuitionCode("g10"), amount: 35000, grade_level_id: "g10" }),
  item({
    id: "g7-antigo",
    code: "TUITION-g7",
    amount: 18000,
    grade_level_id: "g7",
    is_active: false,
  }),
  item({ id: "recurso", kind: "service", code: "HE_RECURSO", amount: 5000 }),
];

const tuition = feeItemMatcher({ feeCode: null, kind: "tuition" });

describe("escolha do item do plano de propinas", () => {
  it("a propina usa o preço da classe do aluno, se a escola o definiu", () => {
    expect(pickFeeItem(plan, tuition, "g10")?.id).toBe("g10");
  });

  it("sem preço da classe (ou com ele desligado), usa a propina geral", () => {
    expect(pickFeeItem(plan, tuition, "g7")?.id).toBe("geral");
    expect(pickFeeItem(plan, tuition, "g11")?.id).toBe("geral");
    expect(pickFeeItem(plan, tuition, null)?.id).toBe("geral");
  });

  it("o preço de uma classe nunca serve a outra nem a uma fatura sem classe", () => {
    const onlyGrade = [item({ id: "g10", grade_level_id: "g10" })];
    expect(pickFeeItem(onlyGrade, tuition, "g7")).toBeNull();
    expect(pickFeeItem(onlyGrade, tuition, null)).toBeNull();
  });

  it("matrícula pelo tipo; emolumento do Superior pelo código; «Documento»/«Outro» nunca um emolumento", () => {
    expect(
      pickFeeItem(plan, feeItemMatcher({ feeCode: null, kind: "enrollment" }), "g10")?.id,
    ).toBe("matricula");
    expect(pickFeeItem(plan, feeItemMatcher({ feeCode: "HE_RECURSO", kind: null }), null)?.id).toBe(
      "recurso",
    );
    expect(pickFeeItem(plan, feeItemMatcher({ feeCode: "HE_OUTRO", kind: null }), null)).toBeNull();
    const other = pickFeeItem(plan, feeItemMatcher({ feeCode: null, kind: null }), null);
    expect(other?.kind).not.toBe("service");
    expect(other?.grade_level_id).toBeNull();
  });

  it("lê linhas de antes da migração (sem a coluna da classe) como preço geral", () => {
    const row = toFeeItemRow({
      id: 7,
      name: "Propina",
      kind: "tuition",
      code: "T",
      amount: "25000.00",
      is_active: true,
    });
    expect(row).toEqual({
      id: "7",
      name: "Propina",
      kind: "tuition",
      code: "T",
      amount: 25000,
      is_active: true,
      grade_level_id: null,
    });
  });

  it("reconhece o erro da coluna em falta (pacote por aplicar), e só esse", () => {
    expect(
      isMissingGradeColumn({
        code: "42703",
        message: "column fee_items.grade_level_id does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingGradeColumn({
        code: "PGRST204",
        message: "Could not find the 'grade_level_id' column of 'fee_items' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingGradeColumn({
        code: "57014",
        message: "canceling statement due to statement timeout",
      }),
    ).toBe(false);
    expect(isMissingGradeColumn(null)).toBe(false);
  });

  it("as importações de dívidas e histórico (sem classe) ficam com o item geral", () => {
    const refs: FeeItemRef[] = [
      {
        id: "g10",
        fee_plan_id: "p1",
        kind: "tuition",
        name: "Propina — 10ª",
        is_active: true,
        grade_level_id: "g10",
      },
      {
        id: "geral",
        fee_plan_id: "p1",
        kind: "tuition",
        name: "Propina",
        is_active: true,
        grade_level_id: null,
      },
      {
        id: "outro-plano",
        fee_plan_id: "p2",
        kind: "tuition",
        name: "Propina",
        is_active: true,
        grade_level_id: null,
      },
    ];
    expect(resolveFeeItemForPlan(refs, "p1", "Mensalidade de Março")?.id).toBe("geral");
    expect(resolveFeeItemForPlan(refs, "p1", "Documento")?.id).toBe("geral");
    expect(resolveFeeItemForPlan(refs.slice(0, 1), "p1", "mensalidade")?.id).toBe("g10");
  });
});

const finance = readFileSync("src/features/finance/server.ts", "utf8");
const fn = (name: string) => {
  const start = finance.indexOf(`export const ${name}`);
  return finance.slice(start, finance.indexOf("export const ", start + 1));
};

describe("propina por classe no servidor", () => {
  it("a fatura escolhe o item pela classe da turma do aluno e, sem valor escrito, usa o preço dele", () => {
    const body = fn("issueInvoice");
    expect(body).toMatch(
      /\.from\("class_groups"\)\s*\.select\("grade_level_id"\)\s*\.eq\("school_id", membership\.schoolId\)/,
    );
    expect(body).toContain("feeItemMatcher({ feeCode, kind })");
    // Só a propina e a matrícula olham para a classe; emolumentos e «Outro» nunca.
    expect(body).toContain("kind ? gradeLevelId : null");
    expect(body).toContain("const amount = data.amount ?? feeItem.amount;");
    expect(body.indexOf("const amount =")).toBeLessThan(
      body.indexOf("discountAmountFor(\n      amount,"),
    );
    expect(body).toMatch(/\.insert\(\{[\s\S]*?amount,\n/);
  });

  it("preços por classe: só Administrador e Tesouraria, só com o pacote aplicado, nunca apaga itens", () => {
    const body = fn("saveGradeTuitionPrices");
    expect(body).toMatch(
      /requireSgaWriterForWrite\(\s*"financeiro",\s*context\.supabase,\s*context\.userId,\s*\["Administrador", "Tesouraria"\],?\s*\)/,
    );
    expect(body.indexOf("gradePricingAvailable(db)")).toBeLessThan(body.indexOf(".update("));
    expect(body).toContain('throw new Error("Classe não encontrada nesta escola.")');
    expect(body).not.toContain(".delete(");
    for (const update of body.matchAll(/\.update\([^)]*\)\s*\.eq\("([a-z_]+)"/g)) {
      expect(update[1]).toBe("school_id");
    }
  });

  it("o preço geral do plano é o item sem classe", () => {
    const body = fn("upsertFeePlanSettings");
    expect(body).toContain("row.kind === item.kind && !row.grade_level_id");
  });
});
