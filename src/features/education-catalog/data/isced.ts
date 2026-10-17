/**
 * Classificações internacionais da UNESCO (UIS):
 *   - ISCED 2011 (CITE 2011): níveis de educação 0–8;
 *   - ISCED-F 2013 (CITE-F 2013): áreas de educação e formação (11 grandes
 *     áreas + «desconhecida», com as áreas restritas de 3 dígitos).
 *
 * Servem para classificar e comparar entre países. Não substituem os
 * currículos nacionais: dizem «isto é ensino secundário superior», não que
 * disciplinas uma escola de um país tem de dar.
 */
import type { CatalogSourceId } from "./sources";

export type IscedLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type IscedLevelDef = {
  level: IscedLevel;
  code: string;
  name: string;
  nameEn: string;
  source: CatalogSourceId;
};

export const ISCED_LEVELS: readonly IscedLevelDef[] = [
  {
    level: 0,
    code: "ISCED-0",
    name: "Educação da primeira infância",
    nameEn: "Early childhood education",
  },
  { level: 1, code: "ISCED-1", name: "Ensino primário", nameEn: "Primary education" },
  {
    level: 2,
    code: "ISCED-2",
    name: "Ensino secundário inferior",
    nameEn: "Lower secondary education",
  },
  {
    level: 3,
    code: "ISCED-3",
    name: "Ensino secundário superior",
    nameEn: "Upper secondary education",
  },
  {
    level: 4,
    code: "ISCED-4",
    name: "Ensino pós-secundário não superior",
    nameEn: "Post-secondary non-tertiary education",
  },
  {
    level: 5,
    code: "ISCED-5",
    name: "Ensino superior de ciclo curto",
    nameEn: "Short-cycle tertiary education",
  },
  {
    level: 6,
    code: "ISCED-6",
    name: "Licenciatura ou equivalente",
    nameEn: "Bachelor's or equivalent level",
  },
  {
    level: 7,
    code: "ISCED-7",
    name: "Mestrado ou equivalente",
    nameEn: "Master's or equivalent level",
  },
  {
    level: 8,
    code: "ISCED-8",
    name: "Doutoramento ou equivalente",
    nameEn: "Doctoral or equivalent level",
  },
].map((l) => ({ ...l, level: l.level as IscedLevel, source: "unesco-isced-2011" as const }));

export type IscedFieldDef = {
  /** «00»…«10», «99» (grande área) ou «011»…«104» (área restrita). */
  code: string;
  name: string;
  nameEn: string;
  /** Grande área a que pertence uma área restrita. */
  broad?: string;
  source: CatalogSourceId;
};

const BROAD: Array<[string, string, string]> = [
  ["00", "Programas e qualificações genéricos", "Generic programmes and qualifications"],
  ["01", "Educação", "Education"],
  ["02", "Artes e humanidades", "Arts and humanities"],
  [
    "03",
    "Ciências sociais, jornalismo e informação",
    "Social sciences, journalism and information",
  ],
  ["04", "Ciências empresariais, administração e direito", "Business, administration and law"],
  [
    "05",
    "Ciências naturais, matemática e estatística",
    "Natural sciences, mathematics and statistics",
  ],
  [
    "06",
    "Tecnologias da informação e comunicação (TIC)",
    "Information and Communication Technologies (ICTs)",
  ],
  [
    "07",
    "Engenharia, indústrias transformadoras e construção",
    "Engineering, manufacturing and construction",
  ],
  [
    "08",
    "Agricultura, silvicultura, pescas e veterinária",
    "Agriculture, forestry, fisheries and veterinary",
  ],
  ["09", "Saúde e protecção social", "Health and welfare"],
  ["10", "Serviços", "Services"],
  ["99", "Área desconhecida", "Field unknown"],
];

const NARROW: Array<[string, string, string]> = [
  ["001", "Programas e qualificações de base", "Basic programmes and qualifications"],
  ["002", "Alfabetização e numeracia", "Literacy and numeracy"],
  ["003", "Competências e desenvolvimento pessoal", "Personal skills and development"],
  ["011", "Educação", "Education"],
  ["021", "Artes", "Arts"],
  ["022", "Humanidades (excepto línguas)", "Humanities (except languages)"],
  ["023", "Línguas", "Languages"],
  ["031", "Ciências sociais e do comportamento", "Social and behavioural sciences"],
  ["032", "Jornalismo e informação", "Journalism and information"],
  ["041", "Ciências empresariais e administração", "Business and administration"],
  ["042", "Direito", "Law"],
  ["051", "Ciências biológicas e afins", "Biological and related sciences"],
  ["052", "Ambiente", "Environment"],
  ["053", "Ciências físicas", "Physical sciences"],
  ["054", "Matemática e estatística", "Mathematics and statistics"],
  [
    "061",
    "Tecnologias da informação e comunicação (TIC)",
    "Information and Communication Technologies (ICTs)",
  ],
  ["071", "Engenharia e técnicas afins", "Engineering and engineering trades"],
  ["072", "Indústrias transformadoras", "Manufacturing and processing"],
  ["073", "Arquitectura e construção", "Architecture and construction"],
  ["081", "Agricultura", "Agriculture"],
  ["082", "Silvicultura", "Forestry"],
  ["083", "Pescas", "Fisheries"],
  ["084", "Veterinária", "Veterinary"],
  ["091", "Saúde", "Health"],
  ["092", "Protecção social", "Welfare"],
  ["101", "Serviços pessoais", "Personal services"],
  ["102", "Serviços de higiene e saúde ocupacional", "Hygiene and occupational health services"],
  ["103", "Serviços de segurança", "Security services"],
  ["104", "Serviços de transporte", "Transport services"],
];

export const ISCED_FIELDS: readonly IscedFieldDef[] = [
  ...BROAD.map(([code, name, nameEn]) => ({
    code,
    name,
    nameEn,
    source: "unesco-isced-f-2013" as const,
  })),
  ...NARROW.map(([code, name, nameEn]) => ({
    code,
    name,
    nameEn,
    broad: code.slice(0, 2),
    source: "unesco-isced-f-2013" as const,
  })),
];

export function iscedLevel(level: IscedLevel) {
  return ISCED_LEVELS.find((l) => l.level === level)!;
}

export function iscedField(code: string) {
  return ISCED_FIELDS.find((f) => f.code === code);
}
