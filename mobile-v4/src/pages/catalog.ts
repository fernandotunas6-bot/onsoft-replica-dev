import type { Role } from "../domain/model";
import { teacherModules, studentModules } from "../components/Academic";
export const infoPages: Record<string, { title: string; intro: string; items: string[] }> = {
  escola: {
    title: "A minha escola",
    intro: "O contexto institucional acompanha todos os serviços do SIGA Plus.",
    items: [
      "A escola activa aparece no selector.",
      "Só vínculos activos autorizam o acesso a aulas, notas e mensagens.",
    ],
  },
  recursos: {
    title: "Recursos",
    intro: "Guias e ferramentas para preparar e acompanhar as aulas.",
    items: [
      "Consulta o horário e o mapa de aulas.",
      "Usa os trabalhos para entregar respostas e acompanhar os prazos.",
      "Acede ao chat para falar com o professor ou os teus alunos.",
    ],
  },
  suporte: {
    title: "Ajuda e suporte",
    intro: "Encontra o serviço adequado para resolver uma dúvida.",
    items: [
      "Dúvidas académicas: abre uma conversa com o professor.",
      "Documentos e vínculos: aguarda o fluxo da secretaria.",
      "Falhas técnicas: descreve o serviço, o passo e a mensagem de erro à equipa da escola.",
    ],
  },
  seguranca: {
    title: "Segurança",
    intro: "Acesso por identidade, escola e permissões.",
    items: [
      "O aluno consulta as suas notas publicadas e presenças.",
      "O professor trabalha nas turmas e disciplinas atribuídas.",
      "A PWA guarda o shell; não armazena notas ou mensagens no cache.",
    ],
  },
  privacidade: {
    title: "Privacidade",
    intro: "Os dados escolares pertencem ao contexto institucional autorizado.",
    items: [
      "Não disponibilizamos um perfil público nem listas de seguidores.",
      "A fotografia da referência não é usada como fotografia do utilizador.",
      "O modo de teste usa pessoas e escolas fictícias.",
    ],
  },
  acessibilidade: {
    title: "Acessibilidade",
    intro: "Navegação por teclado, foco visível e movimento reduzido.",
    items: [
      "Os pontos do calendário têm texto e legenda, além da cor.",
      "Os painéis suportam Escape e mantêm o foco.",
      "A preferência de movimento reduzido é respeitada.",
    ],
  },
  instalacao: {
    title: "Instalar SIGA Plus",
    intro: "Leva a aplicação para o ecrã principal.",
    items: [
      "Android: usa Instalar aplicação no menu do browser quando disponível.",
      "iPhone/iPad: Partilhar → Adicionar ao ecrã principal.",
      "Requer HTTPS ou localhost e uma primeira visita com ligação.",
    ],
  },
  manual: {
    title: "Documentação",
    intro: "Primeiros passos no SIGA Plus Mobile.",
    items: [
      "Meu dia → seleccionar escola → abrir o serviço.",
      "Professor: chamada, notas, planos e tarefas.",
      "Aluno: horário, trabalhos, notas, presenças e documentos.",
    ],
  },
  integracoes: {
    title: "Serviços ligados",
    intro: "A integração institucional será feita com os serviços já existentes no SIGA Plus.",
    items: [
      "Autenticação e vínculos activos por ligar no ambiente isolado.",
      "Horários, notas e presenças usam o contrato académico.",
      "O adaptador de chat converte respostas autorizadas do serviço SIGA. Nenhuma conversa real foi importada nesta demo.",
    ],
  },
  conduta: {
    title: "Código de conduta",
    intro: "Comunicação escolar respeitosa e focada nas aulas.",
    items: [
      "Partilha apenas informações necessárias para o trabalho académico.",
      "Não uses o chat para expor dados pessoais de outras pessoas.",
      "Conflitos e pedidos sensíveis devem seguir o protocolo institucional.",
    ],
  },
};
export function serviceCatalog(role: Role) {
  const modules = role === "professor" ? teacherModules : studentModules;
  return [
    ...modules,
    ...(role === "aluno" ? [["Calendário", "bell", "calendario"]] : [["Avisos", "bell", "avisos"]]),
  ];
}
export const footerGroups = [
  {
    title: "Escola",
    links: [
      ["O meu perfil", "perfil"],
      ["A minha escola", "escola"],
      ["Segurança", "seguranca"],
      ["Privacidade", "privacidade"],
    ],
  },
  {
    title: "Serviços",
    links: [
      ["Mapa de aulas", "calendario"],
      ["Horários", "horario"],
      ["Notas", "notas-aluno"],
      ["Trabalhos", "trabalhos"],
      ["Chat escolar", "mensagens"],
    ],
  },
  {
    title: "Recursos",
    links: [
      ["Guias", "manual"],
      ["Serviços ligados", "integracoes"],
      ["Suporte", "suporte"],
      ["Instalar aplicação", "instalacao"],
    ],
  },
  {
    title: "Comunidade escolar",
    links: [
      ["Avisos", "avisos"],
      ["Contactos e mensagens", "mensagens"],
      ["Código de conduta", "conduta"],
      ["Acessibilidade", "acessibilidade"],
    ],
  },
];
export function routeFor(id: string, role: Role) {
  const aliases: Record<string, string> =
    role === "professor" ? { horario: "aulas", "notas-aluno": "notas", trabalhos: "tarefas" } : {};
  return aliases[id] || id;
}
