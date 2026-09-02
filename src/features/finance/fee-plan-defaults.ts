export const DEFAULT_FEE_PLAN_NAME = "Plano padrão";

export const DEFAULT_FEE_ITEMS = [
  { kind: "tuition" as const, name: "Propina mensal", amount: 45_000 },
  { kind: "enrollment" as const, name: "Taxa de matrícula", amount: 25_000 },
];

export type FeeItemKind = (typeof DEFAULT_FEE_ITEMS)[number]["kind"];
