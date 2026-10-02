# SIGA Plus — experiência mobile limpa

Referência de produto: a aplicação mobile do Lovable permite continuar tarefas entre computador e telefone, enfileirar pedidos e receber avisos quando terminam. Estes são padrões de continuidade e simplicidade, não especificações de cor, medidas ou componentes do SIGA. A interface abaixo é própria do SIGA Plus.

## Princípios

- Uma tarefa principal por ecrã; nome da página, contexto escolar e ação principal visíveis sem percorrer menus.
- Navegação inferior para destinos frequentes e menu “Mais” para todos os módulos, filtrados pela autorização real e pelo plano.
- Pesquisa global persistente no cabeçalho; os resultados só mostram destinos autorizados.
- Superfícies neutras, cartões discretos, tipografia Inter 400/500/600 e cor primária já definida pela escola. Não impor a marca do Lovable nem substituir a identidade da instituição.
- Estado, erro, vazio, carregamento e sucesso explícitos; nenhuma operação é apresentada como concluída antes da resposta do servidor.
- No telefone, listas largas viram linhas resumidas com detalhe expansível; ações destrutivas exigem confirmação. Tabelas oficiais mantêm vista completa e exportação.
- Movimento curto e útil, respeitando `prefers-reduced-motion`; áreas seguras do dispositivo e teclado virtual não tapam ações.

## Estrutura do ecrã

1. Cabeçalho: menu, escola/ano letivo, pesquisa, avisos e conta. Os controles secundários ficam em “Mais”, na conta ou em Definições.
2. Conteúdo: título, resumo do estado, filtros rápidos, cartões ou lista, ação principal. O contexto do período letivo aparece na página quando relevante.
3. Navegação inferior: Início, Alunos, Agenda, Finanças, Mais, consoante papel/permissões/plano. “Mais” abre o catálogo já existente; não cria rotas paralelas.
4. Formulários: uma coluna, rótulos visíveis, erros junto ao campo, ação final clara e preservação dos dados se falhar. Fluxos longos usam passos e revisão antes da confirmação.
5. Filtros: resumo dos filtros ativos, aplicação/limpeza acessíveis e painel que cabe no telefone. Estado dos filtros persiste quando o utilizador volta da ficha.

## Aplicação por módulo

| Módulo      | Primeiro ecrã no telefone                                | Ação principal                       | Detalhe                                              |
| ----------- | -------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| Início      | Calendário, pendências e 3–5 indicadores úteis por papel | Resolver pendência                   | Sem cards decorativos ou métricas sem dados          |
| Alunos      | Pesquisa, estado, turma e dívida com filtros             | Matricular/adicionar conforme acesso | Ficha por secções; dados sensíveis com autorização   |
| Turmas      | Lista por ano, classe e turno                            | Abrir turma                          | Alunos, docentes, horário, assiduidade, notas        |
| Horários    | Dia/semana e conflito visível                            | Configurar horário conforme acesso   | Sala, disciplina, professor, início, intervalo e fim |
| Pedagógica  | Avaliações e tarefas pendentes                           | Lançar nota/presença                 | Estado de fecho e revisão explícitos                 |
| Finanças    | Saldos e cobranças vencidas                              | Emitir/conciliar conforme acesso     | Valor, prazo, estado, método e comprovativo          |
| RH          | Contratos, assiduidade e folha por período               | Rever/fechar conforme acesso         | Salários privados e cálculo auditável                |
| Documentos  | Documentos por pessoa e tipo                             | Emitir documento                     | Pré-visualização antes de emitir                     |
| Comunicação | Caixa, comunicados e avisos                              | Nova mensagem                        | Destinatário e entrega confirmados                   |
| Definições  | Grupos por tarefa                                        | Configurar                           | Alterações com salvamento e resultado explícitos     |

## Regras de implementação

- Preservar as cinco aplicações e os respetivos frontends: SIGA, WEB, ADMIN, PAYFLOW e DOC têm responsabilidades diferentes.
- Reutilizar `AppShell`, `AppSidebar`, `AppLauncher`, `PageHeader`, filtros e componentes existentes. Evitar uma segunda navegação, permissões só visuais ou lógica duplicada.
- Usar tokens do `src/styles.css` e ícones de `src/lib/app-icons.ts` nos módulos. A revisão actual cobre a shell, os componentes partilhados e a primeira lista específica, Alunos.
- A leitura e a escrita continuam protegidas no servidor. Esconder um destino no telefone não concede nem revoga acesso.
- Sem migrações de base de dados para esta adaptação visual.

## Verificação para cada família de páginas

- Larguras 320, 375, 390, 768 e 1024 px; claro/escuro, retrato/paisagem e área segura.
- Menu e navegação por teclado, foco visível, leitor de ecrã, toque e movimento reduzido.
- Papel com poucos módulos, papel administrativo, plano restrito e sessão sem escola.
- Filtros, formulários com erro, loading, listas vazias, títulos longos e dados reais.
- Fluxo voltar → restaurar filtros/posição sem repetir gravações.

## Correcções da base — 30/09/2026

- Destinos mobile derivados do catálogo autorizado do portal, incluindo grants e plano. Professor, aluno e encarregado recebem um atalho académico.
- Finanças reconhece facturas, tesouraria e relatórios financeiros; Mais indica secções fora dos destinos rápidos.
- Menu com título acessível; escola/ano e selector de período disponíveis no telefone; controlos secundários do cabeçalho preservados nos menus existentes.
- Espaço da navegação reservado no contentor inteiro, incluindo rodapé; acções flutuantes usam a mesma altura com área segura.
- Regra de campos exclui checkbox/radio/hidden/range; Input, SelectTrigger e Button adaptam áreas de toque também nos portais dos modais.
- Card declara o atributo usado pelo CSS; diálogos usam altura dinâmica e botões de fecho com área de toque maior.
- A adaptação de listas, filtros, fichas e formulários específicos continua pendente. Estas correcções não implementam sincronização offline ou continuidade entre dispositivos.

A validação local desta revisão inclui typecheck, lint sem erros (51 avisos), build Cloudflare, 2328 testes aprovados/19 ignorados e verificadores estáticos de estilo/acessibilidade. Não equivale a validação visual autenticada de todos os módulos.

## Detalhes visuais e comportamento — 01/10/2026

- Tipografia base de 16 px no telefone, campos legíveis e controlos partilhados com área mínima de toque de 44 px, mantendo a densidade do desktop.
- Pesquisa em linha própria no telefone; filtros secundários recolhíveis, filtros activos legíveis e paginação com indicação acessível da página.
- Alunos usa cartões no telefone, com selecção, ordenação, estados académico/financeiro, contactos e acesso à ficha. A opção “Tabela completa” mantém disponíveis as acções existentes. A selecção de uma página deixa de marcar outra página pelo número de registos seleccionados.
- Modais com conteúdo rolável e rodapé acessível em ecrãs baixos, títulos acessíveis, foco restaurado ao fechar e etapas navegáveis por teclado. O envio respeita os campos obrigatórios e a validação de e-mail do formulário; clicar fora respeita `preventOutsideClose`.
- Breadcrumbs assinalam só o destino actual; indicadores recolhidos deixam de receber foco. Títulos longos, tabs e selectores adaptam-se à largura disponível.

Validação: 2352 testes aprovados/19 ignorados, typecheck e build aprovados, lint com 0 erros/51 avisos, verificadores estáticos de estilo/acessibilidade e `siga:check` aprovados. A revisão Playwright dos componentes passou em 16 combinações de dimensão e tema. Reprodução, capturas e limites em [UI_REVIEW_2026-10-01.md](./UI_REVIEW_2026-10-01.md).

Continuam pendentes a revisão visual autenticada de todas as famílias de páginas e a validação em dispositivos reais, incluindo Safari e teclado virtual. As capturas usam componentes reais com dados fictícios; não representam uma sessão de produção. Esta revisão não foi publicada.

## Correcções finais — 02/10/2026

Formulário rápido com Enter, associação nativa do botão exterior ao formulário,
validação e guarda de pedidos simultâneos. Botão de confirmação de eliminação
restaurado. Selectores contêm textos longos no WebKit e acompanham o tema
claro/escuro nos controlos nativos; fichas e formulários
extensos herdam o limite de altura do diálogo. Matriz Chromium/WebKit e comando
opt-in de pré-verificação autenticada. Resultados e pendências de merge em
[UI_REVIEW_2026-10-02.md](./UI_REVIEW_2026-10-02.md).
