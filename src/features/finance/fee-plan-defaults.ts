export const DEFAULT_FEE_PLAN_NAME = "Plano padrão";
/** `fee_plans.code` é NOT NULL sem default; "DEFAULT" é a convenção do SGA. */
export const DEFAULT_FEE_PLAN_CODE = "DEFAULT";

/** `code` e `frequency` são NOT NULL sem default em `fee_items`. */
export const DEFAULT_FEE_ITEMS = [
  {
    kind: "tuition" as const,
    code: "TUITION",
    frequency: "monthly",
    name: "Propina mensal",
    amount: 45_000,
  },
  {
    kind: "enrollment" as const,
    code: "ENROLLMENT",
    frequency: "once",
    name: "Taxa de matrícula",
    amount: 25_000,
  },
];

export type FeeItemKind = (typeof DEFAULT_FEE_ITEMS)[number]["kind"];
