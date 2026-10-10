/**
 * Fontes do catálogo educacional. Cada registo do catálogo aponta para uma
 * fonte daqui, e o estado de verificação diz quanto se pode confiar nele.
 *
 * Regra: só é «oficial verificado» o que foi conferido com o documento da
 * entidade responsável. Dados escritos a partir da lei ou de planos
 * conhecidos, mas ainda não conferidos linha a linha com o documento
 * publicado, ficam «em revisão» — aparecem nas sugestões, com o aviso.
 */

export type VerificationStatus =
  /** Conferido com o documento oficial da entidade responsável. */
  | "official_verified"
  /** Aprovado pela instituição para uso próprio (não é oficial). */
  | "institutional_approved"
  /** Escrito a partir da fonte indicada; falta conferência formal. */
  | "in_review"
  /** Substituído por versão mais recente. */
  | "outdated"
  | "archived";

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  official_verified: "Oficial verificado",
  institutional_approved: "Institucional aprovado",
  in_review: "Em revisão",
  outdated: "Desactualizado",
  archived: "Arquivado",
};

export type CatalogSourceId =
  | "unesco-isced-2011"
  | "unesco-isced-f-2013"
  | "iso-3166-4217"
  | "ao-lbsee"
  | "ao-inide-planos"
  | "mz-lei-sne"
  | "pt-dge-curriculo"
  | "pt-dges-graus"
  | "siga-catalogo";

export type CatalogSource = {
  id: CatalogSourceId;
  title: string;
  authority: string;
  /** País a que a fonte se aplica; `null` para fontes internacionais. */
  country: string | null;
  url: string | null;
  /** Versão ou diploma de referência. */
  version: string;
  licence: string;
  /** Data em que os dados foram escritos no catálogo. */
  recordedOn: string;
  status: VerificationStatus;
  notes?: string;
};

export const CATALOG_SOURCES: readonly CatalogSource[] = [
  {
    id: "unesco-isced-2011",
    title: "International Standard Classification of Education (ISCED 2011)",
    authority: "UNESCO Institute for Statistics",
    country: null,
    url: "https://uis.unesco.org/en/topic/international-standard-classification-education-isced",
    version: "ISCED 2011",
    licence: "Classificação pública da UNESCO; citar a fonte.",
    recordedOn: "2026-10-10",
    status: "official_verified",
  },
  {
    id: "unesco-isced-f-2013",
    title: "ISCED Fields of Education and Training 2013 (ISCED-F 2013)",
    authority: "UNESCO Institute for Statistics",
    country: null,
    url: "https://uis.unesco.org/en/topic/international-standard-classification-education-isced",
    version: "ISCED-F 2013",
    licence: "Classificação pública da UNESCO; citar a fonte.",
    recordedOn: "2026-10-10",
    status: "official_verified",
    notes:
      "Grandes áreas (2 dígitos) e áreas restritas (3 dígitos). Áreas detalhadas (4 dígitos) por importar.",
  },
  {
    id: "iso-3166-4217",
    title: "Códigos de países (ISO 3166-1) e de moedas (ISO 4217)",
    authority: "ISO",
    country: null,
    url: "https://www.iso.org/iso-3166-country-codes.html",
    version: "ISO 3166-1 alpha-2 / ISO 4217",
    licence: "Códigos de uso público.",
    recordedOn: "2026-10-10",
    status: "official_verified",
  },
  {
    id: "ao-lbsee",
    title: "Lei de Bases do Sistema de Educação e Ensino",
    authority: "República de Angola — Ministério da Educação",
    country: "AO",
    url: null,
    version: "Lei n.º 17/16, alterada pela Lei n.º 32/20",
    licence: "Diploma legal publicado em Diário da República.",
    recordedOn: "2026-10-10",
    status: "in_review",
    notes: "Etapas e classes escritas a partir da lei; conferir com o texto consolidado.",
  },
  {
    id: "ao-inide-planos",
    title: "Planos curriculares do ensino geral e técnico-profissional",
    authority: "INIDE / Ministério da Educação de Angola",
    country: "AO",
    url: null,
    version: "Planos em vigor (forma mais comum usada pelas escolas)",
    licence: "Documentos oficiais; reproduzir só a estrutura (disciplinas por classe).",
    recordedOn: "2026-10-10",
    status: "in_review",
    notes:
      "Mesma lista já usada pelos modelos de estrutura do SIGA (curriculum-templates.ts). Cargas horárias não incluídas: variam por plano.",
  },
  {
    id: "mz-lei-sne",
    title: "Lei do Sistema Nacional de Educação",
    authority: "República de Moçambique — Ministério da Educação e Desenvolvimento Humano",
    country: "MZ",
    url: null,
    version: "Lei n.º 18/2018",
    licence: "Diploma legal publicado no Boletim da República.",
    recordedOn: "2026-10-10",
    status: "in_review",
    notes: "Só etapas e classes. Disciplinas por classe por importar (INDE): sem fonte conferida.",
  },
  {
    id: "pt-dge-curriculo",
    title: "Currículo Nacional — matrizes curriculares do ensino básico e secundário",
    authority: "Direção-Geral da Educação (DGE)",
    country: "PT",
    url: "https://www.dge.mec.pt/curriculo-nacional",
    version: "Decreto-Lei n.º 55/2018",
    licence: "Informação pública do Ministério da Educação.",
    recordedOn: "2026-10-10",
    status: "in_review",
    notes:
      "Componentes do currículo por ciclo. Opções do 12.º ano e cursos profissionais por importar.",
  },
  {
    id: "pt-dges-graus",
    title: "Graus e diplomas do ensino superior",
    authority: "Direção-Geral do Ensino Superior (DGES)",
    country: "PT",
    url: "https://www.dges.gov.pt",
    version: "Decreto-Lei n.º 74/2006 (republicado)",
    licence: "Informação pública.",
    recordedOn: "2026-10-10",
    status: "in_review",
  },
  {
    id: "siga-catalogo",
    title: "Catálogo de referência SIGA Plus",
    authority: "SIGA Plus",
    country: null,
    url: null,
    version: "2026.10",
    licence: "Interno.",
    recordedOn: "2026-10-10",
    status: "institutional_approved",
    notes:
      "Nomes canónicos, abreviaturas e sinónimos de disciplinas e cursos genéricos. Não diz que um curso é oficial num país nem que uma escola o pode oferecer.",
  },
];

export function catalogSource(id: CatalogSourceId) {
  return CATALOG_SOURCES.find((s) => s.id === id)!;
}
