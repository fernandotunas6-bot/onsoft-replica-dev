/**
 * Países do catálogo. Ter um país aqui não quer dizer que o seu sistema
 * educativo esteja carregado: `stagesLoaded` diz se há etapas e classes
 * (ver stages.ts) e a página de cobertura mostra o resto.
 */

export type CountryDef = {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  /** Variante da língua usada nos nomes (BCP 47). */
  locale: string;
  /** ISO 4217. */
  currency: string;
  /** Rótulo dos anos de escolaridade no ensino geral. */
  gradeUnit: "classe" | "ano";
  /** Primeiro nível de divisão administrativa. */
  adminDivision: string;
  stagesLoaded: boolean;
};

export const COUNTRIES: readonly CountryDef[] = [
  {
    code: "AO",
    name: "Angola",
    locale: "pt-AO",
    currency: "AOA",
    gradeUnit: "classe",
    adminDivision: "Província",
    stagesLoaded: true,
  },
  {
    code: "MZ",
    name: "Moçambique",
    locale: "pt-MZ",
    currency: "MZN",
    gradeUnit: "classe",
    adminDivision: "Província",
    stagesLoaded: true,
  },
  {
    code: "PT",
    name: "Portugal",
    locale: "pt-PT",
    currency: "EUR",
    gradeUnit: "ano",
    adminDivision: "Distrito",
    stagesLoaded: true,
  },
  {
    code: "BR",
    name: "Brasil",
    locale: "pt-BR",
    currency: "BRL",
    gradeUnit: "ano",
    adminDivision: "Estado",
    stagesLoaded: false,
  },
  {
    code: "CV",
    name: "Cabo Verde",
    locale: "pt-CV",
    currency: "CVE",
    gradeUnit: "ano",
    adminDivision: "Concelho",
    stagesLoaded: false,
  },
  {
    code: "GW",
    name: "Guiné-Bissau",
    locale: "pt-GW",
    currency: "XOF",
    gradeUnit: "classe",
    adminDivision: "Região",
    stagesLoaded: false,
  },
  {
    code: "ST",
    name: "São Tomé e Príncipe",
    locale: "pt-ST",
    currency: "STN",
    gradeUnit: "classe",
    adminDivision: "Distrito",
    stagesLoaded: false,
  },
  {
    code: "TL",
    name: "Timor-Leste",
    locale: "pt-TL",
    currency: "USD",
    gradeUnit: "ano",
    adminDivision: "Município",
    stagesLoaded: false,
  },
];

export function country(code: string) {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}
