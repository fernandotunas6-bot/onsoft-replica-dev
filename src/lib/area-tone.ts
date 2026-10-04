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
