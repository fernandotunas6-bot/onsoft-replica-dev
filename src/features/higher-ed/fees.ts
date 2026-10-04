/**
 * Emolumentos do Ensino Superior: taxas cobradas por acto académico. Ficam no
 * plano financeiro activo como `fee_items` de tipo «service», cobrança única,
 * identificados pelo código — o valor é sempre da instituição (0 = não cobra).
 */
export const HIGHER_ED_FEES = [
  { code: "HE_RECURSO", name: "Exame de recurso", hint: "Por cadeira, na época de recurso." },
  {
    code: "HE_ESPECIAL",
    name: "Exame de época especial",
    hint: "Por cadeira, para finalistas.",
  },
  { code: "HE_MELHORIA", name: "Exame de melhoria de nota", hint: "Por cadeira." },
  {
    code: "HE_CERTIDAO",
    name: "Certidão de notas",
    hint: "Histórico académico autenticado.",
  },
] as const;

export type HigherEdFeeCode = (typeof HIGHER_ED_FEES)[number]["code"];

/** Categoria escolhida no formulário de fatura → código do emolumento (ou null). */
export function higherEdFeeCodeForCategory(category: string): HigherEdFeeCode | null {
  const value = category.trim().toLowerCase();
  return HIGHER_ED_FEES.find((fee) => fee.name.toLowerCase() === value)?.code ?? null;
}
