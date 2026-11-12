/**
 * Tom visual de cada área do SIGA (cores em styles.css, `[data-tone=…]`).
 *
 * Um tom por área, decidido pelo caminho da página — não por página — para o
 * sistema ficar previsível: quem está no Financeiro reconhece o verde em todas
 * as páginas dele, e não há um estilo novo a cada ecrã.
 */
export type AreaTone =
  "marca" | "pedagogica" | "financeiro" | "secretaria" | "rh" | "comunicacao" | "sistema";

/** Ordem importa: o prefixo mais específico primeiro (RH antes do Financeiro). */
const RULES: Array<[prefix: string, tone: AreaTone]> = [
  ["/financeiro/rh", "rh"],
  ["/professor/presenca", "rh"],
  ["/relatorios/financeiros", "financeiro"],
  ["/relatorios/academicos", "pedagogica"],
  ["/financeiro", "financeiro"],
  ["/faturas", "financeiro"],
  ["/tesouraria", "financeiro"],
  ["/pedagogica", "pedagogica"],
  ["/professores", "pedagogica"],
  ["/planos-aula", "pedagogica"],
  ["/calendario", "pedagogica"],
  ["/aulas-virtuais", "pedagogica"],
  ["/alunos", "secretaria"],
  ["/pessoas", "secretaria"],
  ["/matricula", "secretaria"],
  ["/documentos", "secretaria"],
  ["/acessos", "secretaria"],
  ["/catracas", "secretaria"],
  ["/importar", "secretaria"],
  ["/comunicacoes", "comunicacao"],
  ["/arquivos", "comunicacao"],
  ["/alumni", "comunicacao"],
  ["/configuracoes", "sistema"],
  ["/perfil", "sistema"],
  ["/alterar-senha", "sistema"],
  ["/saas-admin", "sistema"],
];

export function areaToneForPath(pathname: string): AreaTone {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [prefix, tone] of RULES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return tone;
    }
  }
  return "marca";
}

/**
 * Nome da área no breadcrumb (`PageHeader group`).
 *
 * Mesma fonte que o tom, para o rótulo não poder contradizer a cor: Facturas
 * pintava-se de financeiro e escrevia «Relatórios», e as cinco páginas de
 * `/financeiro/rh` anunciavam três áreas diferentes entre irmãs.
 *
 * O nome é o do grupo na barra lateral, não o da área: quem clica em
 * «Académico» espera voltar a lê-lo no caminho, e `pedagogica` é só como a
 * área se chama no código.
 */
export const AREA_LABEL: Record<AreaTone, string> = {
  marca: "SIGA",
  pedagogica: "Académico",
  financeiro: "Financeiro",
  secretaria: "Secretaria",
  rh: "Finanças · RH",
  comunicacao: "Gestão e Comunicação",
  sistema: "Sistema",
};
