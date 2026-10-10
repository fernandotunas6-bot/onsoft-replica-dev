/**
 * SIGA Global Courses Registry — cursos genéricos.
 *
 * Três coisas diferentes que não se misturam:
 *   1. curso genérico (aqui): «Enfermagem», área ISCED-F, nível ISCED;
 *   2. programa curricular oficial de um país (stages.ts): o plano com as
 *      disciplinas por classe, com fonte e versão;
 *   3. oferta da escola (`programs` na base da escola).
 *
 * Um curso estar no catálogo não quer dizer que uma escola esteja autorizada
 * a oferecê-lo. A duração é indicativa: a regulamentada é a do plano do país.
 */
import type { IscedLevel } from "./isced";

export type CourseKind =
  /** Área/ramo do ensino secundário geral (ex.: Ciências Físicas e Biológicas). */
  | "general_track"
  /** Formação média técnica / curso profissional do secundário. */
  | "technical_secondary"
  /** Curso técnico superior de ciclo curto. */
  | "short_cycle"
  | "bachelor"
  | "master"
  | "doctorate";

export const COURSE_KIND_LABEL: Record<CourseKind, string> = {
  general_track: "Secundário geral (área)",
  technical_secondary: "Técnico-profissional",
  short_cycle: "Superior de ciclo curto",
  bachelor: "Licenciatura",
  master: "Mestrado",
  doctorate: "Doutoramento",
};

export const COURSE_KIND_ISCED: Record<CourseKind, IscedLevel> = {
  general_track: 3,
  technical_secondary: 3,
  short_cycle: 5,
  bachelor: 6,
  master: 7,
  doctorate: 8,
};

export type GlobalCourse = {
  code: string;
  name: string;
  short: string;
  aliases: string[];
  kind: CourseKind;
  /** Área restrita ISCED-F 2013. */
  field: string;
  /** Duração indicativa em anos. */
  typicalYears?: number;
};

type Row = [
  code: string,
  name: string,
  short: string,
  aliases: string[],
  kind: CourseKind,
  field: string,
  years?: number,
];

const ROWS: Row[] = [
  // Secundário geral — áreas (Angola, II Ciclo) e cursos científico-humanísticos (Portugal)
  ["SEC-CFB", "Ciências Físicas e Biológicas", "CFB", ["CFB"], "general_track", "053", 3],
  [
    "SEC-CEJ",
    "Ciências Económicas e Jurídicas",
    "CEJ",
    ["CEJ", "Ciências Económico-Jurídicas"],
    "general_track",
    "031",
    3,
  ],
  ["SEC-CH", "Ciências Humanas", "CH", ["CH", "Humanidades"], "general_track", "022", 3],
  ["SEC-CT", "Ciências e Tecnologias", "CT", ["CT"], "general_track", "053", 3],
  ["SEC-CSE", "Ciências Socioeconómicas", "CSE", ["CSE"], "general_track", "031", 3],
  ["SEC-LH", "Línguas e Humanidades", "LH", ["LH"], "general_track", "022", 3],
  ["SEC-AV", "Artes Visuais", "AV", ["AV"], "general_track", "021", 3],

  // Técnico-profissional (secundário)
  [
    "TEC-INF",
    "Técnico de Informática",
    "Informática",
    ["Informática", "Técnico de Informática de Gestão"],
    "technical_secondary",
    "061",
    4,
  ],
  [
    "TEC-RSI",
    "Redes e Sistemas Informáticos",
    "RSI",
    ["Gestão e Programação de Sistemas Informáticos", "GPSI"],
    "technical_secondary",
    "061",
    3,
  ],
  [
    "TEC-DSW",
    "Desenvolvimento de Software",
    "Desenv. Software",
    ["Programação"],
    "technical_secondary",
    "061",
    3,
  ],
  [
    "TEC-CG",
    "Contabilidade e Gestão",
    "Contab. e Gestão",
    ["Contabilidade", "Técnico de Contabilidade"],
    "technical_secondary",
    "041",
    4,
  ],
  [
    "TEC-EE",
    "Electricidade e Electrónica",
    "Electricidade",
    ["Electrotecnia", "Eletricidade e Eletrónica"],
    "technical_secondary",
    "071",
    4,
  ],
  [
    "TEC-CC",
    "Construção Civil",
    "Construção Civil",
    ["Técnico de Obras"],
    "technical_secondary",
    "073",
    4,
  ],
  [
    "TEC-MEC",
    "Mecânica",
    "Mecânica",
    ["Técnico de Mecânica", "Mecatrónica"],
    "technical_secondary",
    "071",
    4,
  ],
  [
    "TEC-ENF",
    "Enfermagem Geral",
    "Enfermagem",
    ["Técnico de Enfermagem", "Enfermagem"],
    "technical_secondary",
    "091",
    4,
  ],
  [
    "TEC-ACL",
    "Análises Clínicas",
    "Análises Clínicas",
    ["Técnico de Análises Clínicas", "Laboratório Clínico"],
    "technical_secondary",
    "091",
    4,
  ],
  ["TEC-FARM", "Farmácia", "Farmácia", ["Técnico de Farmácia"], "technical_secondary", "091", 4],
  [
    "TEC-AGR",
    "Agropecuária",
    "Agropecuária",
    ["Técnico Agrário", "Agricultura"],
    "technical_secondary",
    "081",
    4,
  ],
  [
    "TEC-HT",
    "Hotelaria e Turismo",
    "Hotelaria",
    ["Turismo", "Restauração"],
    "technical_secondary",
    "101",
    3,
  ],
  [
    "TEC-LOG",
    "Logística e Transportes",
    "Logística",
    ["Transportes"],
    "technical_secondary",
    "104",
    3,
  ],
  [
    "TEC-PROF",
    "Formação de Professores do Ensino Primário",
    "Magistério",
    ["Magistério Primário", "Ensino Primário"],
    "technical_secondary",
    "011",
    4,
  ],

  // Superior de ciclo curto
  [
    "CTS-RSI",
    "Redes e Sistemas Informáticos (TeSP)",
    "TeSP RSI",
    ["CTeSP Redes"],
    "short_cycle",
    "061",
    2,
  ],
  [
    "CTS-DSW",
    "Desenvolvimento de Software (TeSP)",
    "TeSP DSW",
    ["CTeSP Programação"],
    "short_cycle",
    "061",
    2,
  ],

  // Licenciaturas
  ["LIC-MED", "Medicina", "Medicina", ["Medicina Geral"], "bachelor", "091", 6],
  [
    "LIC-ENF",
    "Enfermagem",
    "Enfermagem",
    ["Licenciatura em Enfermagem", "Enfermagem Geral"],
    "bachelor",
    "091",
    4,
  ],
  [
    "LIC-ACL",
    "Análises Clínicas e Saúde Pública",
    "Análises Clínicas",
    ["Ciências Biomédicas Laboratoriais"],
    "bachelor",
    "091",
    4,
  ],
  ["LIC-FARM", "Ciências Farmacêuticas", "Farmácia", ["Farmácia"], "bachelor", "091", 5],
  [
    "LIC-EINF",
    "Engenharia Informática",
    "Eng. Informática",
    ["Informática", "Ciência da Computação", "Engenharia de Sistemas"],
    "bachelor",
    "061",
    4,
  ],
  ["LIC-ECIV", "Engenharia Civil", "Eng. Civil", ["Civil"], "bachelor", "073", 5],
  [
    "LIC-EELT",
    "Engenharia Electrotécnica",
    "Eng. Electrotécnica",
    ["Engenharia Eletrotécnica", "Engenharia Eléctrica"],
    "bachelor",
    "071",
    5,
  ],
  ["LIC-EMEC", "Engenharia Mecânica", "Eng. Mecânica", [], "bachelor", "071", 5],
  ["LIC-ARQ", "Arquitectura e Urbanismo", "Arquitectura", ["Arquitetura"], "bachelor", "073", 5],
  [
    "LIC-CG",
    "Contabilidade e Gestão",
    "Contab. e Gestão",
    ["Contabilidade e Auditoria", "Contabilidade e Finanças"],
    "bachelor",
    "041",
    4,
  ],
  [
    "LIC-GEST",
    "Gestão de Empresas",
    "Gestão",
    ["Gestão", "Administração de Empresas"],
    "bachelor",
    "041",
    4,
  ],
  ["LIC-ECO", "Economia", "Economia", [], "bachelor", "031", 4],
  ["LIC-AP", "Administração Pública", "Adm. Pública", ["Gestão Pública"], "bachelor", "041", 4],
  ["LIC-DIR", "Direito", "Direito", ["Ciências Jurídicas"], "bachelor", "042", 5],
  ["LIC-PSI", "Psicologia", "Psicologia", [], "bachelor", "031", 4],
  ["LIC-SOC", "Sociologia", "Sociologia", [], "bachelor", "031", 4],
  ["LIC-PED", "Pedagogia", "Pedagogia", ["Ciências da Educação"], "bachelor", "011", 4],
  [
    "LIC-EP",
    "Ensino Primário",
    "Ensino Primário",
    ["Educação Básica", "Ensino Básico"],
    "bachelor",
    "011",
    4,
  ],
  ["LIC-AGRO", "Agronomia", "Agronomia", ["Engenharia Agronómica"], "bachelor", "081", 5],
  ["LIC-VET", "Medicina Veterinária", "Veterinária", ["Veterinária"], "bachelor", "084", 6],
  [
    "LIC-COM",
    "Ciências da Comunicação",
    "Comunicação",
    ["Comunicação Social", "Jornalismo"],
    "bachelor",
    "032",
    4,
  ],
  ["LIC-TUR", "Turismo", "Turismo", ["Gestão Hoteleira e Turística"], "bachelor", "101", 4],
  ["LIC-LOG", "Logística e Transportes", "Logística", ["Gestão Logística"], "bachelor", "104", 4],
  [
    "LIC-AMB",
    "Engenharia do Ambiente",
    "Eng. Ambiente",
    ["Ambiente", "Ciências Ambientais"],
    "bachelor",
    "052",
    5,
  ],
  ["LIC-TEO", "Teologia", "Teologia", ["Ciências Religiosas"], "bachelor", "022", 4],
  ["LIC-MAT", "Matemática", "Matemática", ["Ensino da Matemática"], "bachelor", "054", 4],
  ["LIC-BIO", "Biologia", "Biologia", ["Ciências Biológicas"], "bachelor", "051", 4],

  // Pós-graduação (genéricos)
  [
    "MES-EDU",
    "Mestrado em Ciências da Educação",
    "Mestrado Educação",
    ["Mestrado em Educação"],
    "master",
    "011",
    2,
  ],
  [
    "MES-GEST",
    "Mestrado em Gestão",
    "MBA",
    ["MBA", "Mestrado em Gestão de Empresas"],
    "master",
    "041",
    2,
  ],
  ["MES-SP", "Mestrado em Saúde Pública", "Mestrado Saúde Pública", [], "master", "091", 2],
  [
    "DOU-EDU",
    "Doutoramento em Ciências da Educação",
    "Doutoramento Educação",
    [],
    "doctorate",
    "011",
    4,
  ],
];

export const GLOBAL_COURSES: readonly GlobalCourse[] = ROWS.map(
  ([code, name, short, aliases, kind, field, typicalYears]) => ({
    code,
    name,
    short,
    aliases,
    kind,
    field,
    typicalYears,
  }),
);

const BY_CODE = new Map(GLOBAL_COURSES.map((c) => [c.code, c]));

export function globalCourse(code: string) {
  return BY_CODE.get(code);
}

export function courseIsced(course: GlobalCourse): IscedLevel {
  return COURSE_KIND_ISCED[course.kind];
}
