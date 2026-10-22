/**
 * Identidade da escola no website gerado.
 *
 * O modelo foi escrito para o ISPAB e diz isso em 177 campos, mais as frases
 * que o assumem como demonstração («Website demonstrativo», «Prévia
 * institucional», «Use informação fictícia nesta demonstração»). Essas frases
 * são honestas enquanto o catálogo inventado está no ar; `site-scope` tira o
 * catálogo, e então deixam de descrever o que o visitante tem à frente — uma
 * escola real, com o seu nome e os seus contactos.
 *
 * Este módulo produz o rascunho inicial que a criação da escola publica: o
 * nome da instituição no lugar do nome do modelo, as frases de demonstração
 * fora, e os contactos que o registo recolheu onde o modelo tinha «contactos
 * oficiais a validar».
 *
 * Nada aqui toca na base de dados nem no HTML: é texto para `values`, que
 * `applyWebsiteValues` aplica campo a campo.
 */
import { websiteTemplate, type WebsiteDraft } from "./content-model";

/** A instituição para quem o modelo foi escrito. */
export const MODEL_INSTITUTION = "ISPAB";

export type SchoolSiteIdentity = {
  /** Nome oficial, como consta do registo. */
  name: string;
  /** Nome curto/comercial — é este que entra no texto corrido e nos títulos. */
  shortName: string;
  /** Página inicial do site da escola, em HTTPS. */
  websiteUrl: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
};

/**
 * Frases que só fazem sentido numa demonstração. A ordem conta: as mais
 * longas primeiro, para não ficarem pedaços da frase maior.
 */
const SCRUB: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s*Cursos, imagens, eventos e dados académicos ilustrativos\.\s*/g, " "],
  [
    /\s*As candidaturas e os pedidos desta prévia não são enviados à instituição\.\s*/g,
    " As candidaturas e os pedidos enviados por este formulário não substituem a inscrição oficial.",
  ],
  [/\s*Versão demonstrativa d[eo]\s*/g, "Website institucional de "],
  [/\s*Use informação fictícia nesta demonstração\.\s*/g, " "],
  [/\s*Percorra o formulário demonstrativo\.\s*/g, " "],
  [/\s*Website demonstrativo\.\s*/g, " "],
  [/\s*·\s*Prévia de website\s*/g, ""],
  [/\s*Prévia institucional\s*/g, ""],
  [/\bNesta prévia,\s*pode\b/g, "Pode"],
  [/\bnesta prévia\b/g, "neste website"],
  [/\bdesta prévia\b/g, "deste website"],
];

/**
 * Campos cujo texto do modelo é um aviso de que falta informação. São
 * substituídos pelo que o registo da escola já sabe. A âncora é o texto por
 * omissão e não a chave: a chave é derivada do conteúdo e muda sempre que o
 * gerador mexe na frase, e aí o teste da identidade falha a dizer qual.
 */
const ANCHORED: ReadonlyArray<{
  readonly when: string;
  readonly set: (identity: SchoolSiteIdentity) => string;
}> = [
  {
    when: `Os contactos, o endereço e os horários oficiais do ${MODEL_INSTITUTION} em Angola ainda precisam de confirmação.`,
    set: (identity) => `Os contactos oficiais de ${identity.shortName}.`,
  },
  { when: "Contactos oficiais a validar.", set: (identity) => contactLine(identity) },
  // Rótulos do formulário de contacto: eram «de exemplo» porque o formulário
  // era uma demonstração. A página passou a ser a página de contactos da
  // escola; os rótulos são os do formulário dela.
  { when: "Nome de exemplo", set: () => "Nome" },
  { when: "O seu nome de exemplo", set: () => "O seu nome" },
  { when: "E-mail de exemplo", set: () => "E-mail" },
];

function contactLine(identity: SchoolSiteIdentity): string {
  const parts = [identity.address, identity.city, identity.phone, identity.email]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "Contactos a publicar pela instituição.";
}

/**
 * Espaços a mais ficam de um corte no meio da frase. Não se mexe no espaço
 * antes de `·` nem de `|`: nesses o espaço é separador e tirá-lo colava o nome
 * da escola ao que vem a seguir («Semente do Saber· Angola»).
 */
function tidy(value: string): string {
  return value.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1").trim();
}

export function applySchoolIdentity(value: string, identity: SchoolSiteIdentity): string {
  const anchored = ANCHORED.find((rule) => rule.when === value);
  if (anchored) return anchored.set(identity);
  let out = value;
  for (const [pattern, replacement] of SCRUB) out = out.replace(pattern, replacement);
  out = out.replaceAll(MODEL_INSTITUTION, identity.shortName);
  return tidy(out);
}

/**
 * Só os campos que mudam entram em `values`: um campo igual ao modelo não
 * precisa de ser guardado, e `applyWebsiteValues` deixa-o como está.
 */
export function schoolIdentityValues(identity: SchoolSiteIdentity): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of websiteTemplate.fields) {
    if (field.kind !== "text") continue;
    const next = applySchoolIdentity(field.value, identity);
    if (next !== field.value) values[field.key] = next;
  }
  return values;
}

/** O rascunho que a criação da escola publica. Sem catálogo, sem campanha. */
export function schoolIdentityDraft(identity: SchoolSiteIdentity): WebsiteDraft {
  return {
    templateVersion: websiteTemplate.version,
    websiteUrl: identity.websiteUrl,
    values: schoolIdentityValues(identity),
    programBindings: {},
    campaignSlug: "",
  };
}
