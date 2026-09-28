export const DEFAULT_FEE_PLAN_NAME = "Plano padrão";
/** `fee_plans.code` é NOT NULL sem default; "DEFAULT" é a convenção do SGA. */
export const DEFAULT_FEE_PLAN_CODE = "DEFAULT";

/**
 * `code` e `frequency` são NOT NULL sem default em `fee_items`. O valor fica 0
 * ("por definir"): o preço é da escola, nunca um valor de exemplo que pareça
 * configurado (antes: 45 000 Kz de propina e 25 000 Kz de matrícula).
 */
export const DEFAULT_FEE_ITEMS = [
  {
    kind: "tuition" as const,
    code: "TUITION",
    frequency: "monthly",
    name: "Propina mensal",
    amount: 0,
  },
  {
    kind: "enrollment" as const,
    code: "ENROLLMENT",
    frequency: "once",
    name: "Taxa de matrícula",
    amount: 0,
  },
];

export type FeeItemKind = (typeof DEFAULT_FEE_ITEMS)[number]["kind"];
