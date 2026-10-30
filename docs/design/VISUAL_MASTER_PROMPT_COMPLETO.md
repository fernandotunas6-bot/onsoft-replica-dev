# SIGA Plus — prompt master do visual, completo

Ficheiro de trabalho. Junta, **sem alterar uma palavra**, os dois documentos que
regem o refinamento visual:

- **Parte I — o contrato:** `VISUAL_MASTER_2026.md`, aprovado pelo proprietário em
  23/10/2026, **com a adenda do proprietário de 27/10/2026** sobre o
  comportamento da sidebar (último commit 7a0124b6, 2026-10-27). Diz o que fazer.
- **Parte II — a matriz de execução:** `VISUAL_MASTER_STATUS.md` (último commit
  revisão de consumidores após #419, 2026-10-30). Diz o que já está provado e o que não está.

Os dois ficheiros originais continuam a ser a fonte de verdade; este é uma cópia
para colar como prompt, e caduca a cada alteração deles. As ligações internas da
Parte I para `VISUAL_MASTER_STATUS.md` referem-se à Parte II deste ficheiro.

## Ler primeiro: a regra da sidebar foi invertida

A adenda de 27/10/2026, no fim da Parte I, **substitui** a regra que tornava a
sidebar compacta por omissão: no desktop entra agora **expandida a 240px**, a
alternância do botão fixa o estado, e o flyout por hover só existe quando está
recolhida. Instruções anteriores em contrário — incluindo as secções de 23 e
24/10 da Parte II e a linha da fase 3, que ainda descrevem «menu compacto por
omissão, sem expansão automática» — devem ser lidas à luz desta adenda.

## Nenhuma fase está concluída

Ordem de ataque, do mais descoberto para o mais adiantado:

| Ordem | Fase | Estado | Porque está aqui |
| --- | --- | --- | --- |
| 1 | 5.2 — backend/dados | **bloqueado** | Falta acesso de teste autorizado para medir consultas, índices, cache e payload sem escrever em escolas reais. Nada medido. |
| 2 | 5.3 — objectivos mensuráveis | **bloqueado** | INP/LCP/CLS p75 e FPS reais exigem ambiente instrumentado e amostra adequada. Nada medido. |
| 3 | 7 — dispositivos e browsers | parcial | Só Chromium headless em componente isolado. Faltam Android/iOS/tablets físicos, Safari/Edge/Firefox, orientação, zoom e rede lenta. |
| 4 | 2.3 — componentes universais | parcial | Os modais estão refinados; inputs, selectores, listas, filtros, paginação, pesquisa, calendário, abas, notificações, estados e dashboards não. A maior superfície por rever que não depende de acesso externo. |
| 5 | 6 — módulos | parcial | As melhorias partilhadas propagam, mas a auditoria módulo a módulo do inventário não está fechada. |
| 6 | 2.1 — superfícies | parcial | Definições e PremiumModal feitos; cartões, bordas, sombras, composição e alinhamentos por rever em cada módulo. |
| 7 | 4.1 / 4.2 / 4.3 — interacções, animações, toque | parcial | Cobertos três formulários e as categorias ≥44px; faltam skeletons, scroll, cache de filtros, durações/frames e duplo envio nos restantes. |
| 8 | 3 — navegação contextual | parcial | Falta validar todos os contextos, cabeçalhos, escola activa, rotas e teclado virtual — e a linha da matriz precede a adenda de 27/10. |
| 9 | 8 — acessibilidade/segurança | parcial | Faltam leitores de ecrã e isolamento remoto com duas escolas e múltiplos perfis. O contraste AA **dos tokens** está medido desde 30/10, mas isso não cobre texto sobre gradientes, imagens ou marca escolar. |
| 10 | 2.2, 1, 5.1, 9, 10 | parcial | Contraste e tamanho tipográfico medidos em 30/10; faltam imagens, nitidez de SVG, pesos e hierarquia página a página. Mais auditoria runtime, baseline de produção comparável e percursos reais completos. |

**O travão que atravessa tudo:** validação visual em sessão autenticada, em
dispositivos físicos e com troca de escola, nas larguras 390/768/1024/1440px,
continua pendente de staging autorizado (issue #249) e travada pelo MFA. A Parte I
é explícita: requisito sem acesso registra-se como `bloqueado`, não se dispensa.
Testes DOM não comprovam dispositivos físicos, RLS remota, pagamentos reais nem
Web Vitals p75.

---

**PARTE I — O CONTRATO** · `docs/design/VISUAL_MASTER_2026.md`, verbatim

---

# PROMPT MASTER — SIGA PLUS 2026

Refinamento Visual, Fluidez, Interactividade e Performance de Alto Nível

**Padrão obrigatório do projecto, aprovado pelo proprietário em 23/10/2026.**
Este contrato rege todo o refinamento visual futuro. Não é uma declaração de
conclusão. Cada requisito precisa de evidência na matriz de execução. Instruções
visuais antigas que imponham modais grandes ou expansão automática do menu devem
ser interpretadas segundo este padrão e o aditamento final do proprietário.

## MISSÃO PRINCIPAL

Actua como um engenheiro sénior de Frontend, especialista em UI/UX, Design Systems, acessibilidade, performance Web e arquitectura de aplicações SaaS multi-tenant.

Trabalha directamente sobre o projecto SIGA Plus, no repositório "fernandotunas6-bot/onsoft-replica-dev".

O teu objectivo é elevar a qualidade visual e a experiência de utilização do SIGA Plus ao nível de aplicações profissionais como Linear, Notion, Jira, Confluence e plataformas SaaS educacionais modernas.

Não criar um sistema novo. Não substituir a arquitectura existente. Não eliminar funcionalidades. Refinar profundamente aquilo que já está construído.

A experiência final deve transmitir cinco características:

1. Fluidez: todas as interacções devem parecer naturais, contínuas e sem bloqueios.
2. Nitidez: textos, ícones, tabelas e elementos gráficos devem ser extremamente legíveis.
3. Rapidez: cliques, toques, abertura de menus e navegação devem responder imediatamente.
4. Simplicidade: menos ruído visual, menos burocracia e melhor organização da informação.
5. Consistência: todos os módulos devem partilhar uma linguagem visual coerente.

## FASE 1 — AUDITORIA INTEGRAL ANTES DAS ALTERAÇÕES

Inspecciona o repositório, as dependências, os layouts, os componentes reutilizáveis, as rotas, os módulos e os mecanismos de carregamento de dados.

Identifica:

- Componentes visualmente inconsistentes.
- Excessos de cartões, títulos, bordas, cores e textos.
- Espaçamentos irregulares.
- Ícones desalinhados ou de estilos diferentes.
- Ecrãs demasiado carregados.
- Menus extensos e pouco contextuais.
- Botões que demoram a responder.
- Páginas com carregamentos desnecessários.
- Formulários pesados ou com demasiados campos visíveis.
- Tabelas lentas, especialmente com grandes volumes de dados.
- Re-renderizações e chamadas de rede redundantes.
- Problemas de scroll e transições.
- Diferenças de comportamento entre desktop e mobile.

Produz um diagnóstico por prioridade, distinguindo problemas visuais, funcionais e de desempenho.

Começa pelas causas estruturais e componentes partilhados, não por ajustes isolados em cada página.

## FASE 2 — DESIGN SYSTEM PREMIUM

Conserva a identidade institucional, o logótipo, a tipografia principal e as cores oficiais existentes do SIGA Plus.

### 2.1. Superfícies e composição

- Fundos claros, elegantes e uniformes.
- Cartões discretos, apenas quando melhoram a leitura.
- Bordas finas e separadores subtis.
- Sombras muito suaves.
- Cantos arredondados consistentes.
- Hierarquia tipográfica bem definida.
- Espaçamentos proporcionais.
- Alinhamentos matematicamente consistentes.
- Áreas de conteúdo amplas e organizadas.
- Eliminação de elementos decorativos desnecessários.

Evita interfaces excessivamente coloridas ou com muitos contentores aninhados.

### 2.2. Tipografia e nitidez

Optimiza a renderização dos textos, números, tabelas e formulários.

Garante:

- Tipografia legível em todos os dispositivos.
- Pesos tipográficos consistentes.
- Hierarquia correcta entre títulos, subtítulos e conteúdo.
- Ícones SVG nítidos.
- Imagens de alta qualidade com dimensões apropriadas.
- Boa densidade de informação.
- Contraste acessível.
- Alinhamento preciso entre ícones, textos e botões.

Não substituas indiscriminadamente os tipos de letra do projecto.

### 2.3. Componentes universais

Audita, uniformiza e refina:

- Botões e campos de formulário.
- Modais e painéis laterais.
- Selectores e menus suspensos.
- Tabelas, listas e filtros.
- Paginação e pesquisa.
- Calendários.
- Abas e indicadores de navegação.
- Notificações e mensagens de confirmação.
- Estados vazios, de erro e carregamento.
- Cartões estatísticos e dashboards.

Cria ou melhora componentes reutilizáveis, respeitando a arquitectura actual e evitando duplicações.

## FASE 3 — NAVEGAÇÃO CONTEXTUAL INTELIGENTE

Usa como referência os princípios do Atlassian Design System:
https://atlassian.design/components/navigation-system/

Implementa ou refina a navegação contextual existente.

### Desktop

A sidebar deve ser:

- Limpa e visualmente discreta.
- Compacta e intuitiva.
- Adaptada ao módulo activo.
- Capaz de apresentar opções secundárias apenas quando necessárias.
- Coerente entre todas as áreas do sistema.
- Suave nas transições de expansão e recolha.

O cabeçalho deve apresentar apenas informação realmente útil.
Evita repetir o nome do módulo em vários lugares.

### Mobile

- Navegação adequada ao toque.
- Menus que não ocupem desnecessariamente o ecrã.
- Acesso rápido às acções principais.
- Áreas clicáveis confortáveis.
- Scroll suave.
- Barras e elementos fixos que não ocultem conteúdo.
- Respeito pelas áreas seguras do Android e iOS.
- Compatibilidade com teclado virtual.

Preserva a navegação institucional, as permissões e a selecção da escola activa.

## FASE 4 — FLUIDEZ E RESPOSTA IMEDIATA

Esta é uma das prioridades máximas.
Todas as acções devem transmitir resposta visual imediata.

### 4.1. Interacções

Implementa, quando apropriado:

- Feedback instantâneo ao toque.
- Estados hover, pressed, focus e disabled.
- Transições suaves e discretas.
- Indicadores de carregamento localizados.
- Skeletons consistentes.
- Abertura rápida de menus e modais.
- Fecho natural de painéis.
- Navegação sem flashes visuais desnecessários.
- Preservação inteligente de scroll, filtros e estado quando adequado.

Nenhum botão deve parecer inactivo enquanto processa uma operação.

### 4.2. Animações

Usa animações apenas quando melhoram a compreensão da interface.

Referências de duração:

- Feedback simples: 80–150 ms.
- Menus e elementos pequenos: 120–180 ms.
- Modais e painéis: 160–240 ms.

Prioriza animações com "transform" e "opacity" quando tecnicamente adequadas.
Evita animações que provoquem alterações constantes de layout.
Respeita a preferência "prefers-reduced-motion".

O logótipo animado institucional existente deve ser preservado. Não adicionar vídeos de abertura nem efeitos pesados.

### 4.3. Responsividade real ao toque

Verifica:

- Botões que exigem vários toques.
- Atrasos entre toque e resposta.
- Elementos com sobreposição invisível.
- Eventos que bloqueiam o scroll.
- Menus que fecham inesperadamente.
- Duplos envios de formulários.
- Cliques repetidos durante operações pendentes.
- Problemas de foco e teclado.

Utiliza áreas interactivas preferencialmente de pelo menos 44 × 44 px, sem comprometer a densidade visual.

## FASE 5 — OPTIMIZAÇÃO PROFUNDA DE PERFORMANCE

Investiga o desempenho real antes de aplicar optimizações.

### 5.1. Frontend

Avalia e optimiza:

- Tamanho do bundle.
- Code splitting por rota.
- Lazy loading adequado.
- Importações desnecessárias.
- Componentes com renderizações excessivas.
- Memorização onde existir benefício comprovado.
- Carregamento de imagens e fontes.
- Listas e tabelas extensas.
- Pesquisa com debounce quando apropriado.
- Cache e invalidação de dados.
- Carregamento de módulos secundários.
- Cálculos pesados na thread principal.

Não adicionar bibliotecas pesadas para resolver problemas simples.

### 5.2. Backend e dados

Verifica o percurso entre interacção e resposta:

- Consultas lentas.
- Pedidos repetidos.
- Carregamentos sequenciais desnecessários.
- Paginação.
- Índices apropriados.
- Estados de sessão e cache.
- Transferência excessiva de informação.
- Integrações Supabase e Cloudflare onde existirem.

Não alterar políticas RLS, permissões ou modelos de dados sem análise e testes adequados.

### 5.3. Objectivos mensuráveis

Nos ambientes e dispositivos de teste, procura atingir:

| Indicador         | Objectivo                                       |
| ----------------- | ----------------------------------------------- |
| INP, percentil 75 | ≤ 200 ms                                        |
| LCP, percentil 75 | ≤ 2,5 segundos                                  |
| CLS, percentil 75 | ≤ 0,1                                           |
| Animações         | Aproximar-se de 60 FPS                          |
| Feedback ao toque | Imediato, sem esperar pela rede                 |
| Navegação interna | Sem bloqueios ou recarregamentos desnecessários |

Apresenta medições antes e depois.
Não confundir uma animação rápida com uma operação efectivamente concluída.
Nunca simular sucesso de pagamentos, matrículas, notas ou outras operações críticas antes da confirmação do servidor.

## FASE 6 — REFINAMENTO DOS MÓDULOS DO SIGA PLUS

Aplica a linguagem visual comum, respeitando as particularidades de cada módulo existente.

- Administração: painéis claros, configuração simplificada e navegação contextual.
- Alunos e Matrículas: pesquisas rápidas, listas organizadas, formulários progressivos e perfis legíveis.
- Professores: acesso simples a turmas, horários, aulas, presenças e avaliações.
- Académico: pautas, notas, períodos e disciplinas apresentados com clareza, sem alterar regras de cálculo ou fecho.
- Financeiro: propinas, cobranças, facturas, recibos e pagamentos com estados inequívocos e feedback confiável.
- Arquivo: selecção e carregamento de ficheiros rápidos, pré-visualizações adequadas e integração visual consistente com os módulos consumidores.
- Comunicação: mensagens, avisos e notificações organizados, sem ruído.
- Relatórios: filtros acessíveis, tabelas eficientes e exportações com progresso visível.
- Configurações: organização por categorias e eliminação de passos redundantes.
- Website escolar: conservar o estilo e a identidade visual do website actual; melhorar apenas a fluidez, nitidez, responsividade e ligação ao portal.

Não criar módulos novos nem inventar fluxos de negócio.

## FASE 7 — EXPERIÊNCIA MOBILE E DESKTOP

Validar as principais interfaces nos seguintes contextos:

- Android e iOS.
- Tablets.
- Windows e macOS.
- Chrome, Edge, Safari e Firefox, conforme aplicável.
- Ecrãs pequenos, médios e grandes.
- Orientação vertical e horizontal.
- Zoom e escalonamento do sistema.
- Redes lentas e dispositivos de desempenho reduzido.

Usa testes em diferentes larguras, incluindo os limites em torno de 767, 768, 1023 e 1024 px.

Se o projecto Flutter fizer parte do escopo inspeccionado, reutiliza os princípios visuais no Flutter, utilizando componentes e animações nativos apropriados, sem substituir a sua arquitectura.

Não confundir a aplicação Flutter com o portal Web nem regressar à arquitectura Mobile V4 anterior.

## FASE 8 — ACESSIBILIDADE E SEGURANÇA

Adopta WCAG 2.2 AA como referência de acessibilidade.
Verifica navegação por teclado, foco visível, contraste, leitores de ecrã e mensagens de erro.

Em toda a modernização:

- Preserva o isolamento multi-tenant.
- Respeita a escola activa.
- Mantém o controlo de acesso por função.
- Preserva MFA, sessão e autenticação.
- Não expõe dados de outras escolas.
- Não altera cálculos académicos e financeiros.
- Não remove validações existentes.
- Não altera contratos de API sem compatibilidade.

Nenhuma melhoria visual pode introduzir regressões de segurança.

## FASE 9 — EXECUÇÃO E VALIDAÇÃO AUTOMATIZADA

Não te limites a propor melhorias: implementa as alterações que forem tecnicamente seguras e verificáveis.

Segue esta ordem:

1. Inspeccionar e medir o estado inicial.
2. Corrigir problemas estruturais dos componentes partilhados.
3. Refinar o Design System existente.
4. Optimizar a navegação contextual.
5. Melhorar a interactividade e o feedback.
6. Resolver gargalos de performance identificados.
7. Propagar melhorias aos módulos.
8. Validar desktop, tablet e mobile.
9. Executar testes e comparar desempenho.
10. Documentar resultados e preparar alterações para revisão.

Utiliza testes automatizados, testes de regressão visual e Playwright quando disponíveis.
Testa os principais percursos reais: autenticação, escolha de escola, administração, matrículas, notas, pagamentos, arquivos, pesquisas e navegação entre módulos.
Confirma que não foram introduzidas falhas de permissões ou operações duplicadas.

## FASE 10 — GIT, COMMITS E RELATÓRIO FINAL

Trabalha a partir do estado real do repositório.
Antes de alterar, identifica mudanças não commitadas e evita sobrescrever trabalho existente.

Organiza as mudanças em commits claros, por exemplo:

- "refactor(ui): unify shared visual components"
- "perf(frontend): optimize rendering and navigation"
- "style(responsive): refine mobile and desktop layouts"
- "test(ui): add interaction and regression coverage"

Prepara uma Pull Request com evidências de validação.
Não executar deploy de produção, migrações ou alterações destrutivas sem as verificações e autorizações necessárias.

No relatório final, apresentar:

- Problemas encontrados.
- Ficheiros e componentes alterados.
- Melhorias visuais concluídas.
- Optimizações de velocidade realizadas.
- Resultados dos testes.
- Comparação de desempenho anterior e posterior.
- Screenshots comparativos das interfaces relevantes.
- Pendências e riscos reais.
- Commits e Pull Request.

Não afirmar que algo foi testado, publicado ou corrigido sem evidência.

## CRITÉRIO DEFINITIVO DE QUALIDADE

A interface final deve transmitir a sensação de um software institucional premium:

- Tocou → respondeu.
- Clicou → reagiu.
- Navegou → fluiu.
- Abriu → apresentou informação clara.
- Trabalhou → não encontrou obstáculos visuais desnecessários.

O utilizador deve conseguir trabalhar durante várias horas sem fadiga visual, confusão de menus, atrasos injustificados ou excesso de informação.
Preserva a identidade e toda a lógica do SIGA Plus.
A prioridade não é adicionar mais funcionalidades. É tornar as funcionalidades existentes extraordinariamente bem apresentadas, rápidas, intuitivas, estáveis e agradáveis de utilizar.
Executa com rigor de engenharia, simplicidade visual e atenção aos detalhes.

## Aditamentos obrigatórios do proprietário

> Também criar opções para não usar o sidebar maiores que violam a regra e desfazer os modais ficando apenas os necessários e pequeno e colocar como padrão o formato do prompt e deixar por opção de escolar os modais

> Quero que este prompt do visual seja master padrão e seja executado ao pé da letra nada deve ficar se fora

Aplicação operacional: menu compacto e conteúdo em página por omissão; apresentação
alternativa escolhida pela escola, sem conceder permissões. Confirmações, avisos de
perda de dados e acções breves podem continuar em modais pequenos. Não encolher
formulários complexos até ficarem inutilizáveis: migrar o conteúdo para páginas,
preservando validação, estado, acessibilidade e operações. Migrar cada consumidor
com testes; não ocultar funcionalidades ou remover indiscriminadamente componentes.

## Controlo de execução

A matriz em [VISUAL_MASTER_STATUS.md](VISUAL_MASTER_STATUS.md) deve cobrir todas
as fases e todos os módulos. Usar apenas `por auditar`, `parcial`, `implementado`,
`validado` ou `bloqueado`, com evidência e próximo passo. Uma fase só é concluída
quando todos os requisitos aplicáveis tiverem validação; requisito não aplicável
precisa de justificação explícita. Testes DOM não comprovam dispositivos físicos,
RLS remota, pagamentos reais ou Web Vitals p75. Não dispensar requisitos por falta
de acesso: registá-los como bloqueados até poder validá-los.


## Actualização do proprietário — 27/10/2026: comportamento da sidebar

Esta instrução **substitui apenas** a regra anterior que tornava a sidebar compacta por omissão e desactivava flyouts por hover:

- **Entrada no portal desktop:** sidebar expandida (240px) se a pessoa ainda não escolheu outro estado; a escolha de recolher/expandir feita no botão das três linhas prevalece sobre o formato por omissão anterior.
- **Clique no botão do topo:** alterna uma única vez e fixa o estado, sem voltar a expandir/recolher por hover, mudança de página ou renderização.
- **Preferência persistente:** guardar por utilizador e escola no navegador; restaurar no regresso e isolar os contextos. Se o armazenamento estiver bloqueado, a alternância continua activa enquanto a página permanecer montada.
- **Sidebar recolhida (64px):** passar o rato sobre um ícone com subfunções abre um flyout lateral; ao sair, fecha com tolerância curta para a transição até ao conteúdo. Clique/toque e teclado continuam operacionais.
- **Sidebar expandida:** preservar o acordeão por clique que já existe, sem flyout substitutivo por hover. Preservar contexto, permissões, links, classes visuais, colunas, menu da escola e responsividade mobile.

As restantes regras do padrão visual de 23/10/2026 continuam válidas.

---

**PARTE II — A MATRIZ DE EXECUÇÃO** · `docs/design/VISUAL_MASTER_STATUS.md`, verbatim

---

# Execução do padrão visual — 23/10/2026

**30/10/2026 — secções verticais e auditoria (implementado):** padrão aplicado a 15 consumidores; ficha de Pessoas também vertical no telemóvel. Corrigidos scroll que podia deslocar a página, nomes extensos e contraste activo (6,65:1 claro / 7,92:1 escuro no ensaio controlado). 557 testes aprovados em 76 ficheiros, seis excepções preexistentes de contraste decorativo ignoradas. Tipos e lint dos ficheiros alterados aprovados; conferência Chromium em seis larguras e temas claro/escuro. Script reproduzível: `node scripts/qa/vertical-navigation.mjs`. Validação autenticada e publicação pendentes; push anterior bloqueado pela revisão automática. Evidência e limites em `docs/agents/HANDOFF_VERTICAL_NAV_2026-10-30.md`.

**29/10/2026 — integração da escolha de turma com o formulário actual:**
preservada a correcção de Claude que cancela Enter na pesquisa e coloca o foco
na lista. Integração com `main` 74695eaa sem reescrever o histórico; o selector
pesquisável passa também a anunciar os erros por campo introduzidos no formulário
partilhado. Pesquisar conserva o erro associado à escolha; mudar a escolha limpa-o.
171 testes locais de alunos e formulários passaram nesta integração; tipos,
compilação, CI e conferência publicada continuam sujeitos aos respectivos resultados.
Nenhuma matrícula foi criada ou alterada para este ensaio.

**28/10/2026 — escolha de turma na matrícula existente (implementado):**
o selector nativo recebe pesquisa opcional por palavras sem distinção de acentos.
A matrícula existente exige escolha explícita quando não há turma de origem; a
abertura pela turma conserva o preenchimento contextual. Filtrar mantém o ID
seleccionado, mesmo quando não corresponde à pesquisa; o texto da pesquisa não
entra nos dados enviados. A opção é activada somente neste fluxo de matrícula;
os outros selectores e as opções dependentes mantêm o comportamento anterior.
132 testes locais de alunos e QuickForm passaram, incluindo envio do ID escolhido,
validação obrigatória, contexto, opções dependentes e protecção contra duplo envio.
Lint sem erros. Compilação, CI e validação publicada ainda pendentes nesta entrega.
Sem migração, alteração de permissões ou gravações de teste.

**28/10/2026 — destinos das secções da turma (implementado):**
os deep links `?secao=` passam a reservar 88 px antes da secção e a colocar o foco
no título sem criar uma nova paragem de Tab. O acesso explícito a Resumo deixa de
ser ignorado e a mudança de turma volta a posicionar a secção pedida.
Medição anterior em produção: título Alunos aos 20 px, cabeçalho até aos 44 px;
título parcialmente oculto e sem foco. 63 testes locais de ficha e navegação passaram.
Validação visual da versão publicada e dispositivos físicos ainda pendentes.
Sem alterações aos dados, permissões ou fluxo de matrícula.

**28/10/2026 — pesquisa na lista da turma (implementado):**
`/pedagogica/turmas/$turmaId` permite procurar por nome (sem distinção de acentos,
maiúsculas ou ordem das palavras) ou número de processo, apenas nos alunos já
devolvidos para a turma. Lista por ordem alfabética, contagem acessível e recuperação
da pesquisa sem resultados. Nenhum endpoint, permissão, matrícula ou dado foi alterado.
Evidência: 8 testes de render da ficha e 492 testes académicos passaram localmente;
lint sem erros. Publicação e ensaio autenticado desta versão ainda pendentes.
Não comprova dispositivos físicos nem isolamento remoto entre escolas.

**27/10/2026 — botões discretos e cabeçalho semitransparente (PR em revisão):**
o componente global `Button` conserva estados hover, loading, disabled e foco
visível, mas elimina o efeito de compressão `scale` ao clicar. A navegação
e os ícones deixam de crescer, rodar ou deslocar-se no hover; as indicações
estáticas da página activa, a cor de realce e o foco acessível continuam.
O cabeçalho desktop sobe de 56 para 64 px, o móvel de 64 para 68 px;
o fundo passa a 95% opaco, reduzindo para 90% quando há suporte a
`backdrop-filter` suave. Favoritos informa `aria-pressed`, notificações
informa `aria-expanded`. Sem migrações nem mudança de permissões.
Teste de contrato visual adicionado em `tests/ui/quiet-controls.test.ts`.
**CI, testes em aparelhos e publicação ainda por confirmar.**

**27/10/2026 — navegação e Início, incremento em PR (CI por concluir):**
a página `/pedagogica` deixa de repetir «Área Pedagógica» no cabeçalho e passa a
«Ensino e aprendizagem»; separadores com indicador activo composto por fundo,
texto e sublinhado. A sidebar partilhada ganha um traço activo de 3 px,
respeitando tema e redução de movimentos. O Início administrativo passa a
destacar somente contagens existentes e autorizadas: candidaturas por confirmar,
documentos pendentes, faturas em aberto e próximos eventos; o erro de carregamento
não é zero. Referências de pesquisa: Canvas Dashboard/To-do, Moodle Timeline/
recentes, Linear UI (hierarquia e contraste). Testes de regressão pedagógica e
função pura de prioridades adicionados. **Evidência de CI, capturas em dispositivos
e publicação de produção ainda pendentes**; não declarar execução integral.

Contrato: [VISUAL_MASTER_2026.md](VISUAL_MASTER_2026.md). Esta matriz acompanha
**todas as dez fases**. O padrão está registado; a execução integral está parcial.
Não considerar o sistema todo validado por causa dos testes abaixo.

**27/10/2026 — auditoria de contexto/sessão (fases 1, 8 e 9):** selecção de
escola partilhada, invalidação entre contas e rejeição de respostas ultrapassadas;
testes de componentes e login Chromium a 390/1440 px, foco de registo/entrada e
ausência de overflow. Sem redesenho. [Matriz, evidências e limites](../qa/system-audit-2026-10-27/README.md).
As restantes fases continuam parciais. O proprietário indicou o Colégio Adventista
— Huambo para testes; isolamento de staging não confirmado.
**27/10/2026 — sidebar persistente e flyout recolhido:** o novo pedido do proprietário substitui o compacto por omissão. Em ramo de revisão: expandido por omissão no desktop, botão com alternância fixa por utilizador/escola, subfunções em flyout por hover apenas quando recolhida e acordeão actual preservado quando expandida. Cobertura adicionada em Vitest/jsdom; execução de CI, dispositivo físico e produção ainda **não validadas**.

**25/10/2026 — backend de horários/calendário:** agenda autenticada, sincronização
de presenças e migrações verificadas; [evidência e limites](../architecture/ACADEMIC_AGENDA.md).
Sem mudanças visuais e sem montagem de FullCalendar nas páginas. Os estados
visuais dos módulos abaixo mantêm-se; este ciclo não constitui validação de UI.

**25/10/2026 — SIGA Context Engine (fase 3, opção A):** com turma ou disciplina aberta,
a sidebar existente (240/64 px) mostra «Voltar», o cabeçalho da entidade e só as funções
dessa entidade; sem coluna nova nem estilos novos. Motor da PR #332. Desktop testado em
jsdom; mobile e capturas por fazer. [Especificação, inventário e estado](../specs/SIGA_CONTEXT_ENGINE_2026.md).

**25/10/2026 — SIGA Context Engine (aluno, breadcrumb e telemóvel):** a ficha
`/alunos/$studentId` abre por secção (`?secao=identificacao|academico|financeiro|documentos`),
com «Ver ficha completa»; sem secção fica como estava. Com a ficha aberta, a equipa vê na
sidebar «Voltar», o aluno e as secções que a conta lê. Em `/pedagogica` e `/planos-aula` o
`PageHeader` acrescenta ao breadcrumb a turma e a disciplina da URL. Sem estilos novos.
No telemóvel, o hub «Mais» mostra o mesmo menu da entidade. Testado em jsdom e em capturas
com dados fictícios a 1440/390 px; o módulo Alunos continua `por auditar` (falta sessão
autenticada) e falta validar em aparelhos.

**25/10/2026 — SIGA Context Engine (materiais e ficha do encarregado):** o menu da turma e
da disciplina ganha «Materiais e ficheiros» (`/arquivos?turma`, com o menu e o breadcrumb da
turma); «Presenças» fica só na disciplina. Na ficha do aluno, foto, turma, estado, anular,
editar, encarregados e presença só aparecem a quem grava em Pessoas; o encarregado vê a
ficha sem esses botões. Nova secção «Histórico» (`?secao=historico`, só Administração e
Secretaria): um bloco por ano lectivo com média, situação e médias por disciplina; no
telemóvel a tabela fica com a disciplina e a média. Sem estilos novos; capturas com dados
fictícios a 1440 e 390 px, sem scroll horizontal.

**25/10/2026 — SIGA Context Engine (horário da turma):** o menu da turma e da disciplina
ganha «Horário da turma» (`/pedagogica?tab=horarios&turma`); o horário abre nessa turma, com
o menu e o breadcrumb da turma. Sem estilos novos; captura com dados fictícios a 1440 px.

**25/10/2026 — SIGA Context Engine (menu do professor):** o perfil `/professores/<id>` fica
na área Secretaria (onde a lista de pessoas o abre) e a sidebar mostra «Voltar», `Professor ·
‹nome›`, «Perfil e turmas» e «Horário semanal». Este abre o horário da escola na vista por
professor (`/pedagogica?tab=horarios&professor`), com o menu e o breadcrumb do professor; só
para quem grava no Pedagógico, os que têm a lista de professores. Sem estilos novos; capturas
com dados fictícios a 1440 px.

**25/10/2026 — SIGA Context Engine (planos do professor):** o menu do professor ganha «Planos
de aula» (`/planos-aula?professor`): só os planos das disciplinas que o professor dá, com a
linha «Planos das disciplinas de ‹nome› · Ver todos os planos». Os filtros de turma, disciplina
e trimestre passam a ter a opção «Todas…»; antes o select mostrava a primeira turma com a lista
inteira. Sem estilos novos; captura com dados fictícios a 1440 px.

**25/10/2026 — SIGA Context Engine (presenças do professor):** o menu do professor ganha
«Presenças» (`/pedagogica?tab=presencas&professor`): as aulas do dia são só as desse professor,
com o nome dele ao lado da data, e cada uma abre a chamada como antes. O histórico geral de
presenças fica o da escola. Sem estilos novos; captura com dados fictícios a 1440 px.

**25/10/2026 — SIGA Context Engine (ficha da turma):** a turma passa de modal a página própria,
`/pedagogica/turmas/<id>`, com a secção em `?secao=` (resumo, alunos, professores e
disciplinas, horário, avaliações). O conteúdo é o do modal (o mesmo componente, numa caixa da
página; o nome passa a ser o título). O separador Turmas abre a página, e o menu da turma ganha
«Ficha da turma» e «Alunos da turma». Sem estilos novos; capturas com dados fictícios a 1440 e
390 px, sem scroll horizontal. No telemóvel a tira de secções da ficha (`ModalSidebar`, como em
todos os modais) só mostra uma de cada vez; o hub «Mais» leva às secções do menu.

**25/10/2026 — SIGA Context Engine (trabalhos da turma):** «Trabalhos» entra no grupo Ensino do
menu da turma e da disciplina e abre `/pedagogica/trabalhos?turma&disciplina`: os TPC, trabalhos
e projectos que os professores publicam no detalhe da aula, numa lista «Em curso» (prazo mais
próximo primeiro) e outra «Prazo terminado», com o tipo, a disciplina (na turma) e o prazo. O
professor só vê os das disciplinas que lecciona. Criar e arquivar continuam no detalhe da aula,
para onde a página leva. O menu do professor ganha «Trabalhos criados»
(`/pedagogica/trabalhos?professor`): os trabalhos dele em todas as turmas, cada um com a turma e
a disciplina. Sem estilos novos; capturas com dados fictícios a 1440 e 390 px, sem scroll
horizontal.

**26/10/2026 — SIGA Context Engine (presenças da turma e professor da disciplina):** o menu da
turma ganha «Presenças», que abre as aulas do dia só dessa turma (o título diz o nome dela), e o
da disciplina ganha «Professor responsável», que abre o perfil de quem a dá nessa turma quando o
servidor o devolve. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (turma do aluno):** no menu do aluno, o grupo «Turma do aluno»
leva à ficha, aos trabalhos e ao horário da turma da matrícula (só Administração e Secretaria).
A turma vem da ficha que a página leu do servidor, nunca da URL. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (continuar onde estava):** de volta à área académica sem turma
aberta, a sidebar mostra uma linha «Continuar em 10.ª A · Matemática» (ícone de histórico), que
reabre a turma ou disciplina onde a conta estava, com os filtros dessa página. Só aparece se o
servidor ainda devolve a turma. Sem estilos novos (a mesma linha das entradas do menu).

**26/10/2026 — SIGA Context Engine (financeiro do aluno):** em `/alunos/<id>?secao=financeiro` a
ficha mostra todas as faturas do aluno (antes, as cinco mais recentes), em «Por pagar» (o prazo mais
antigo primeiro) e «Pagas», cada uma com o estado do registo (`StatusBadge`: Vencida · paga em
parte, Por pagar, Paga), o vencimento e o que falta, e os totais Faturado, Pago e Falta pagar (com
a parte vencida). A ficha completa continua com as cinco mais recentes e uma ligação «Ver as N
faturas». Quem o servidor não deixa ler as faturas já não faz o pedido. Evidência: capturas a 1440
e 390 px sem scroll horizontal. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (página da fatura):** `/faturas/<id>` mostra a fatura (estado,
mês, emissão, vencimento, valor, desconto, multa, total, pago e o que falta), o aluno a quem foi
emitida e os pagamentos e recibos, cada um com o seu estado (um recibo estornado aparece como tal e
não conta como pago). O número da fatura passa a ligação na lista de faturas e no financeiro do
aluno. A sidebar mostra o menu da fatura («Voltar», `Fatura · FT-…`, «Detalhes e recibos», «Todas
as faturas» e, a quem abre fichas de alunos, o financeiro e a ficha do aluno). Receber e anular
continuam na lista. Evidência: capturas a 1440 e 390 px sem scroll horizontal. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (cobranças na fatura):** a página da fatura mostra, à Tesouraria
e à Administração, as cobranças electrónicas dessa fatura (Multicaixa Express ou referência), da
mais recente para a mais antiga, com o estado do registo (`StatusBadge`), a referência, a última
mensagem do fornecedor e o recibo, quando já existe. Uma cobrança não conta como paga antes de o
fornecedor a confirmar. A Secretaria lê a fatura sem esta secção (o servidor nem a pede). Sem estilos
novos.

**26/10/2026 — SIGA Context Engine (relatórios da turma):** o menu da turma e da disciplina ganha
«Relatórios da turma» (grupo Acompanhamento), que abre `/relatorios/academicos?turma=<id>` já
filtrado por essa turma. Com a turma na URL, o filtro de turma segue a URL; escolher outra turma ou
limpar os filtros actualiza a URL. Uma turma que a escola não devolve não filtra nada. Sem estilos
novos.

**26/10/2026 — SIGA Context Engine (turma e faturas do aluno):** o menu da turma ganha
«Renovar matrículas» (só na turma, a quem grava em Pessoas) e «Alunos em risco» (os alertas e a
análise abrem já nessa turma; `/pedagogica/risco?turma=` guarda a turma escolhida). `/faturas?aluno=`
mostra todas as faturas de um aluno, com «Faturas de ‹nome› · processo …» e «Ver todas as
faturas»; chega-se lá por «Faturas do aluno» no menu da fatura (a tesouraria, que não abre fichas)
e por «Receber pagamentos» no menu do aluno (Administração). Sem estilos novos.

**26/10/2026 — SIGA Context Engine (página do ficheiro):** `/arquivos/<id>` mostra o ficheiro
(tipo, tamanho, título, categoria, data, código, área, acesso, o nível da conta e o
proprietário), «Abrir» e «Descarregar» a quem pode abrir o conteúdo, a turma e o aluno a que
está ligado e a auditoria. O painel de detalhes dos Arquivos ganha «Abrir a página do
ficheiro» (fora do selector de ficheiros). A sidebar mostra o menu do ficheiro («Voltar»,
`Ficheiro · …`, «Detalhes e auditoria», «Todos os arquivos» e, quando o servidor devolve a
ligação, «Pasta da turma», «Documentos do aluno» e «Ficha do aluno»). Renomear, mover, mudar o
acesso e apagar continuam na lista. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (entregas dos trabalhos):** com as entregas no main (#336),
cada trabalho de `/pedagogica/trabalhos` tem «Ver entregas», que abre `/pedagogica/tarefas/<id>`
(a turma inteira, com devolver e nota). A ligação tem 44 px de altura no telemóvel e o mesmo
estilo da de «Entregas» no detalhe da aula. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (ficha do funcionário):** `/financeiro/rh/funcionarios` lista
os vínculos laborais (nome, número, cargo, departamento, tipo e estado), com procura, e cada linha
abre `/financeiro/rh/funcionarios/<id>`: o vínculo, o professor da mesma pessoa, os contratos, as
faltas (com as que estão por rever) e os recibos de vencimento por folha, cada secção com a
ligação para a página do RH onde se trabalha sobre ela. O hub do RH ganha «Funcionários». A
sidebar mostra o menu do funcionário («Voltar», `Funcionário · …`, a ficha, todos os
funcionários, rever faltas, folha, alterações salariais e o perfil do professor), e o menu do
professor ganha «Ficha de RH» (Administração). Linhas da lista com 56 px; sem estilos novos.

**26/10/2026 — SIGA Context Engine (página do comunicado):** cada comunicado abre
`/comunicacoes/<id>` com o texto inteiro (as quebras de linha mantêm-se), o estado, o público, o
canal e as datas. O título na lista de Comunicações e nos painéis (Administração, aluno e
encarregado) passa a ser uma ligação para a página. A Administração, a Secretaria e o Professor
recebem o menu do comunicado (o comunicado e a lista); o aluno e o encarregado lêem a página sem
menu. Mesmos cartões e `StatusBadge` da página da fatura. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (painel lateral sem separador vazio):** o separador
«Relacionado» do painel lateral só aparece quando a entidade aberta tem relações com destino ou
acções. Na página da fatura abria vazio; fica só «Mensagens», e o menu da fatura na sidebar leva
às páginas ligadas. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (cobranças → fatura):** em Bancos e Conciliação, cada cobrança
AppyPay tem «Ver fatura», que abre `/faturas/<id>` com os recibos e as cobranças dessa fatura. Só
aparece a quem abre as faturas (Administração e Tesouraria). A ligação tem 44 px de altura no
telemóvel. Sem estilos novos.

**26/10/2026 — SIGA Context Engine (turma em página do main):** com a #346 no main, a ficha da
turma é a página `/pedagogica/turmas/<id>` do main (tudo numa página, sem o modal). A #332 deixa
a sua versão e acrescenta só `?secao=`: «Alunos da turma» e as outras entradas do menu levam à
secção, que ganhou um id e um título ligado (`aria-labelledby`). Sem estilos novos.

**26/10/2026 — RH e Alumni abrem a sua página:** `/financeiro/rh` e as suas páginas (folha,
salários, pagamentos, presença, faltas) estavam definidas dentro de `/financeiro`, e as do Alumni
dentro de `/alumni`. A página de cima não tem `<Outlet />`, por isso estes endereços mostravam o
Caixa ou o painel do Alumni. Os ficheiros passaram a `financeiro_.rh_.*.tsx` e `alumni_.*.tsx`:
os endereços são os mesmos e cada página mostra o seu ecrã, sem estilos novos.
`tests/routes/route-nesting-contract.test.ts` falha se uma página voltar a ficar dentro de outra
sem `<Outlet />`.

## Diagnóstico por prioridade

| Prioridade / natureza  | Evidência inicial                                                                                       | Correcção / estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 funcional / visual  | `/configuracoes` redireccionava sempre para `/` e para um modal grande.                                 | Página por omissão; opção `settingsModal` na preferência existente da escola.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1 visual / interacção | Menu recolhido voltava a expandir com hover, mudando a largura do conteúdo.                             | Compacto por omissão; expansão por botão; opção `expandedSidebar` por escola.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1 funcional           | `StackNav.close` capturava estado dirty antigo; trocar categoria ignorava alterações pendentes.         | Guarda actualizada e testes de confirmação; navegação para fora da página usa bloqueador do router.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P1 funcional           | Pedido de abrir definições sem painel devolvia o mesmo `undefined` que ausência de pedido.              | Pedido raiz representado por string vazia e consumido uma só vez.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1 funcional           | FormModal/QuickModal não bloqueavam directamente Enter repetido nem `disabled` no handler.              | Bloqueio síncrono até à resolução do callback, incluindo WizardModal; feedback de operação pendente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P2 acessibilidade      | Categorias das Definições tinham alvos com 27–32,14 px de altura no ensaio.                             | Altura mínima de 44 px, confirmada nas seis larguras.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P2 visual              | PremiumModal tinha halo desfocado, sombra forte e destaque decorativo; wizard simples usava largura xl. | Cabeçalho neutro e sombra suave; wizard sem painel visual usa lg, preservando campos e acções.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P1 auditoria restante  | Existem outros consumidores com tamanho xl/2xl/full.                                                    | **Fechado em 25/10/2026** — os 7 candidatos do inventário `evidence/2026-10-23/large-modal-inventory.json` têm veredicto: 4 migrados para página (`StudentExtensiveModal` → `/alunos/$studentId`, `TurmaProfileModal` → `/pedagogica/turmas/$turmaId`, `PersonWizardModal` → `/pessoas/novo`, `PersonProfile360Modal` → `/pessoas/$personId`), 2 justificam o tamanho (`MoreHub`, `PrintTemplateStudio`), 1 já estava corrigido (`AssignTeacherForm`). Nos quatro migrados, os formulários pequenos e confirmações continuam em modal, como o contrato permite. Falta validação visual em sessão autenticada para todos — bloqueada pelo MFA nesta sessão. |
| P1 desempenho          | Inventário actual de preloads gerado para 18 módulos.                                                   | Diagnóstico de bytes disponível; latências e gargalos de rede/re-render ainda por medir em sessão autenticada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Cobertura das fases

| Fase                            | Estado      | Evidência e próximo passo                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — auditoria integral          | parcial     | Branch/HEAD/estado inicial limpos, arquitectura e handoff lidos; 18 módulos/186 ficheiros do inventário verificados. Falta auditoria runtime completa de todos os módulos.                                                                                                  |
| 2.1 — superfícies               | parcial     | Definições em página, coluna menor; PremiumModal mais discreto; rever cartões, bordas, sombras, composição e alinhamentos em cada módulo.                                                                                                                                   |
| 2.2 — tipografia/nitidez        | parcial     | **Medido em 30/10/2026:** 78 pares de contraste, 16 falhas, 10 corrigidas; restam 6 isenções com razão escrita (bordas decorativas). Raiz tipográfica do portátil alinhada com a do monitor por decisão do proprietário. Regressão em `tests/ui/theme-token-contrast.test.ts`. Faltam imagens, nitidez de SVG, pesos e hierarquia página a página. [Relatório](VISUAL_2026-10-30_FASE_2-2.md). |
| 2.3 — componentes universais    | parcial     | StackedModal, SettingsCenter, FormModal, QuickModal, WizardModal, PremiumModal e SequentialSheetModal refinados; falta revisão integral de inputs, selectores, listas, filtros, paginação, pesquisa, calendário, abas, notificações, estados e dashboards.                  |
| 3 — navegação contextual        | parcial     | Menu compacto, sem expansão automática; preferências institucionais; guardas de acesso mantidas. Falta validar todos os contextos, cabeçalhos, escola activa, rotas e teclado virtual.                                                                                      |
| 4.1 — interacções               | parcial     | Pendência local e bloqueio de envios em três formulários; faltam estados, skeletons, scroll, cache de filtros e feedback dos outros consumidores.                                                                                                                           |
| 4.2 — animações                 | parcial     | Não foi adicionado vídeo nem alterado o logótipo. Falta medir durações/frames e movimento reduzido em todas as superfícies.                                                                                                                                                 |
| 4.3 — toque                     | parcial     | Categorias ≥44 px no ensaio; envios repetidos bloqueados nos componentes cobertos. Faltam sobreposições, scroll, foco, menus e duplo envio nos restantes formulários.                                                                                                       |
| 5.1 — frontend                  | parcial     | Build e inventário de preloads disponíveis. Falta baseline de produção comparável, profiling de render, imagens/fontes, listas grandes, imports, cache e cálculos. Sem novos pacotes.                                                                                       |
| 5.2 — backend/dados             | bloqueado   | Nenhum SQL/API/RLS alterado. Falta acesso de teste autorizado para medir consultas, índices, cache, payload e integrações sem escrever em escolas reais.                                                                                                                    |
| 5.3 — objectivos mensuráveis    | bloqueado   | Comparação geométrica abaixo. INP/LCP/CLS p75 e FPS reais ainda não medidos; exigem ambiente instrumentado e amostra adequada.                                                                                                                                              |
| 6 — módulos                     | parcial     | Melhorias partilhadas propagam aos consumidores; auditoria individual no inventário abaixo ainda não está concluída.                                                                                                                                                        |
| 7 — dispositivos e browsers     | parcial     | Chromium headless: 390/767/768/1023/1024/1440 px no componente isolado. Android/iOS/tablets/Windows/macOS físicos, Safari/Edge/Firefox, orientação, zoom e rede lenta continuam por validar. Flutter não alterado neste incremento Web; não usar Mobile V4 como substituto. |
| 8 — acessibilidade/segurança    | parcial     | Testes de guardas, fecho, foco de Radix e bloqueio de envios; sem alterações a auth/RLS/regras de negócio. Faltam leitores de ecrã/contraste AA e isolamento remoto com duas escolas e múltiplos perfis.                                                                    |
| 9 — regressão e percursos reais | parcial     | Testes e ensaio reproduzível abaixo. Auth/MFA/escolha de escola/matrículas/notas/pagamentos/arquivo/pesquisa completos exigem contas de ensaio; não executados em produção.                                                                                                 |
| 10 — entrega                    | parcial     | Contrato completo ligado a AGENTS.md, evidências e matriz versionados; commits e PR devem acompanhar o estado final. Sem deploy ou migrações.                                                                                                                               |

## Inventário por módulo

Estado refere-se à **auditoria integral deste contrato**, não à existência das funcionalidades.

| Módulo                                    | Estado      | Fonte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Próximo passo                                                                                                                                                                                                           |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (`dashboard`)                   | parcial     | `src/routes/index.tsx`, `src/features/dashboard/portals/AdminPortalDashboard.tsx`. Auditoria de código (25/10/2026): (1) `stats`/`miniStats`/`toneBg`/`dotTone`/`DashboardGreeting` e os lazy imports `DashboardCharts`/`DashboardAgeChart`/`TeacherWorkspacePanel` em `index.tsx` são recomputados mas nunca usados no JSX — duplicam o que já existe em `AdminPortalDashboard.tsx`; (2) cartões de estatística (`AdminPortalDashboard.tsx:680,687,699`) usam `hover:scale-[1.02]` sem `motion-reduce:`, ao contrário de `Button`/`tooltip`/`alert-dialog`; (3) `tests/visual/{baseline,current}/dashboard.png` são de 10–16/08 e `dashboard_debug.png` de 08/09 — anteriores ao padrão visual e à página de login actual, não servem de prova. | Login autenticado bloqueado por falta de código MFA nesta sessão; falta validação visual real (390/768/1024/1440px), renderização dos gráficos (`DashboardCharts`) com dados reais e gerar novas capturas de regressão. |
| Alunos / matrículas internas (`alunos`)   | por auditar | `src/routes/alunos/index.tsx`, `src/routes/alunos/$studentId.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Alumni / antigos alunos (`alumni`)        | por auditar | `src/routes/alumni.tsx`, `src/routes/alumni.$alumniId.tsx`, `src/routes/alumni.$alumniId.portfolio.tsx`, `src/routes/alumni.portal.tsx`, `src/routes/alumni.portal.portfolio.tsx`, `src/routes/alumni.portal.portfolio.showcase.tsx`, `src/routes/alumni.portal.portfolio.print.tsx`, `src/routes/alumni.insights.tsx`, `src/routes/alumni.operations.tsx`, `src/routes/alumni.communications.tsx`, `src/routes/alumni.matching.tsx`, `src/routes/alumni.documents.tsx`, `src/routes/alumni.calendar.tsx`, `src/routes/alumni.pipeline.tsx`                                                                                                                                                                                                      | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Pessoas e professores (`pessoas`)         | por auditar | `src/routes/pessoas/index.tsx`, `src/routes/professores/$teacherId.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Área pedagógica / turmas (`pedagogica`)   | por auditar | `src/routes/pedagogica.tsx`, `src/routes/relatorios.academicos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Tesouraria e faturas (`financeiro`)       | por auditar | `src/routes/financeiro.tsx`, `src/routes/faturas.tsx`, `src/routes/relatorios.financeiros.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| RH, assiduidade e folha salarial (`rh`)   | por auditar | `src/routes/financeiro.rh.tsx`, `src/routes/financeiro.rh.folha.tsx`, `src/routes/financeiro.rh.faltas.tsx`, `src/routes/financeiro.rh.presenca.tsx`, `src/routes/financeiro.rh.pagamentos.tsx`, `src/routes/professor.presenca.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Documentos (`documentos`)                 | por auditar | `src/routes/documentos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Calendário e ICS (`calendario`)           | por auditar | `src/routes/calendario.tsx`, `src/routes/calendario.ics.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Comunicações (`comunicacoes`)             | por auditar | `src/routes/comunicacoes.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Acessos, grants e 2FA (`acessos`)         | por auditar | `src/routes/acessos.tsx`, `src/routes/alterar-senha.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Matrícula pública (`matricula`)           | por auditar | `src/routes/matricula/$slug.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Integrações catalog-ready (`integracoes`) | por auditar |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Arquivos (`arquivos`)                     | por auditar | `src/routes/arquivos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Planos de Aula (`lesson-plans`)           | por auditar | `src/routes/planos-aula.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Motor Central de Importação (`importar`)  | por auditar | `src/routes/importar.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Catracas e Cartão Virtual (`catracas`)    | por auditar | `src/routes/catracas.tsx`, `src/routes/api/catracas/device-scan.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| SaaS Control Center (plataforma) (`saas`) | por auditar | `src/routes/saas-admin.tsx`, `src/routes/criar-escola.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Auditar com dados controlados e perfil autorizado.                                                                                                                                                                      |
| Configurações                             | parcial     | `src/routes/configuracoes.tsx`, `SettingsCenter`, `StackedModal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Validar persistência por escola e todos os painéis com conta autorizada.                                                                                                                                                |
| Website escolar                           | por auditar | `src/features/school-website` e `painel/escolas`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Conservar identidade; testar portal, responsividade e configuração.                                                                                                                                                     |
| Relatórios                                | por auditar | Rotas académicas/financeiras existentes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Filtros, grandes volumes e progresso de exportação.                                                                                                                                                                     |
| Flutter                                   | por auditar | `mobile-flutter` se presente na revisão seguinte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Confirmar implementação existente e validar separadamente em dispositivos nativos.                                                                                                                                      |

## Comparação observada

Ensaio **isolado**, com dados controlados. Não representa conta escolar real nem Web Vitals de produção.

| Medida                                               | Antes      | Depois       |
| ---------------------------------------------------- | ---------- | ------------ |
| Apresentação das Definições por omissão              | modal      | página       |
| Overlay / bloqueio de scroll do body                 | 1 / activo | 0 / inactivo |
| Largura da coluna das categorias, viewport 1440      | 176 px     | 132 px       |
| Altura mínima dos alvos das categorias, viewport 390 | 27 px      | 44 px        |
| Overflow horizontal nas seis larguras                | 0 casos    | 0 casos      |
| Erros de execução no ensaio                          | 0          | 0            |
| INP/LCP/CLS p75                                      | não medido | não medido   |

Os tamanhos observados dependem da escala rem existente. A mudança de largura
é de 25%; não é uma melhoria de velocidade medida. Não atribuir ganhos de tempo
ou percentis a estas capturas. O inventário actual de preloads é uma fotografia
do build; não fornece comparação antes/depois de tempo de carregamento.

### Capturas comparativas

| Antes — 1440 px                                        | Depois — 1440 px                                       |
| ------------------------------------------------------ | ------------------------------------------------------ |
| ![Antes](evidence/2026-10-23/settings-before-1440.png) | ![Depois](evidence/2026-10-23/settings-after-1440.png) |

| Antes — 390 px                                        | Depois — 390 px                                       |
| ----------------------------------------------------- | ----------------------------------------------------- |
| ![Antes](evidence/2026-10-23/settings-before-390.png) | ![Depois](evidence/2026-10-23/settings-after-390.png) |

### Reprodução e limites

- `node scripts/siga/visual-master/settings-browser.mjs`: baseline imutável `9defaf1`, Chromium, movimento reduzido, seis larguras, navegação de categorias e capturas. Requer o commit base acessível no Git e browser Playwright instalado.
- `node scripts/siga/check-modules.mjs`: 18 módulos, 186 ficheiros verificados.
- `node scripts/siga/performance-inventory.mjs`: artefactos/preloads e hooks dos 18 módulos; não conta pedidos realmente executados.
- `vitest run tests/ui ... --maxWorkers=2`: 48 ficheiros, 277 testes aprovados no incremento inicial. Testes finais registados no relatório de validação.
- `tsc --noEmit` com heap de 3072 MB: concluído sem erros no incremento inicial. A primeira tentativa com heap de 8192 MB foi terminada pelo ambiente (137), sem diagnóstico TypeScript.
- Build com `SIGA_NITRO_PRESET=node-server`: concluído no incremento inicial, sem publicação. Revalidar após incorporar actualizações remotas.
- ESLint dirigido: zero erros; dois avisos Fast Refresh pré-existentes no ficheiro que também exporta hooks de contexto.

A suite com mocks/DOM não prova persistência real, RBAC remoto, RLS, MFA, concorrência
financeira ou dispositivos físicos. Nenhum destes pontos pode ser marcado como
validado sem executar o respectivo percurso. Todas as fases continuam obrigatórias.

## Validação final deste incremento

PR: [#262](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/262), em rascunho.
Código integrado com as actualizações `b06b252` (auth lazy) e `50770ec`
(navegação contextual) do main, preservando ambos os trabalhos.

| Verificação                                | Resultado                                                                                    | Limite                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Suite completa `vitest run --maxWorkers=2` | 608 ficheiros aprovados; 3 ignorados. **4.174 testes aprovados; 19 ignorados**, zero falhas. | Executada sobre o incremento e auth lazy; após integrar a última correcção de sidebar, verificação dirigida abaixo.          |
| Navegação após integração de main          | 4 ficheiros, **50 testes aprovados**.                                                        | Sidebar, configurações, contexto e dados não guardados.                                                                      |
| Último ajuste de botões pendentes          | 5 ficheiros, **36 testes aprovados**.                                                        | Header de fecho visivelmente desactivado; não exige repetir a suite inteira para a prop opcional e o rótulo de preferências. |
| TypeScript após integração                 | **Zero erros**, heap 3072 MB.                                                                | Compilação local; não valida permissões no servidor.                                                                         |
| Build de produção após integração          | **Aprovado**, preset Node.                                                                   | Sem publicação; warnings existentes de directives e `inputValidator` obsoleto noutras áreas.                                 |
| ESLint dirigido                            | **Zero erros**, dois avisos Fast Refresh preexistentes.                                      | Hooks/contexto partilham o ficheiro StackedModal.                                                                            |
| Acessibilidade estática incremental        | **Aprovada**; 954 ficheiros analisados, 14 alterados.                                        | Scanner ignora primitivos Radix; não comprova WCAG AA, contraste real ou leitor de ecrã.                                     |
| Estilo incremental                         | **Aprovado**, 49/49 rotas cobertas; 14 ficheiros alterados.                                  | Checklist estática.                                                                                                          |
| Chromium isolado                           | **12 cenários aprovados**; seis larguras × antes/depois.                                     | Sem contas reais nem aparelhos físicos.                                                                                      |
| CI GitHub do código `1be6a91`              | **Pendente** na última consulta.                                                             | Não declarar CI aprovada com base nos testes locais.                                                                         |

A suite completa emite um aviso conhecido do jsdom sobre navegação completa,
mas termina com zero falhas. Os 19 testes ignorados não contam como validação.
O artefacto `preload-inventory.json` foi actualizado pelo build final; representa
apenas o estado actual. Não há medição p75 nem ganho de carregamento atribuído a
este incremento.

Commits publicados de implementação: `faa4784` (contrato), `2b0f4be` (padrões),
`fc11dc2` (integração de main), `1be6a91` (feedback de pendência). O commit de
relatório/evidências que contém esta secção não muda lógica da aplicação.

## Refinamento transversal — sidebar e modais compactos (23/10/2026)

O contrato visual da PR #262 e o trabalho paralelo das PRs #252/#259/#270 já fazem
parte de `main`. Este incremento **não** substitui sidebar, navegação ou sistema
de diálogos; preserva a margem esquerda recta, a concavidade direita, o catálogo
por papel e o estado dos formulários.

| Área             | Ajuste dirigido                                                                                                         | Prova e limite                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Navegação        | Linhas raiz e subitem com alvo mínimo de 44 px em ecrãs estreitos; em desktop (lg) mantêm a densidade original 36/32 px | Contrato em `tests/ui/compact-sidebar-modal-touch.test.tsx`; testar 390/1024 px com sessão no staging |
| Diálogos simples | Acções no rodapé com alvo mínimo de 44 px, sem alterar os dois botões, labels ou `onOpenChange`                         | Teste de semântica com `Dialog` existente                                                             |
| PremiumModal     | Sombra leve e rodapé neutro; continuam campos, título, descrição, botões e scroll existentes                            | Teste DOM; sem conversão de matrículas/finanças em modal simplificado                                 |

Estado: alterações submetidas à revisão/CI; **não concluir QA autenticada nem
declarar deploy de produção sem resultados reais**. O inventário restante de
modais grandes e o ensaio de diferentes escolas continuam pendentes.

## Flyouts laterais compactos — referência Claude IDE (24/10/2026)

Incremento na [PR #274](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/274), sincronizado com `main` `057d4aa7`, **sem substituir** a sidebar das PRs #252/#262/#271 ou os modais simples do projecto.

- O cabeçalho da escola abre um painel à direita com a mesma instituição activa, a lista de escolas autorizadas, o perfil e as configurações existentes. Hover aplica-se apenas ao rato; clique e teclado continuam disponíveis. O painel tem altura limitada e scroll quando necessário.
- As subfunções da sidebar expandida abrem em `Popover` à direita, fora do contentor com scroll. Destinos, parâmetros, permissões e indicadores activos provêm do catálogo actual; a barra recolhida mantém o seu menu accionado explicitamente, sem reabrir a sidebar em hover.
- O menu superior não é modal quando aberto por hover: o resto da barra permanece interativo. O ano lectivo activo fica junto da escola seleccionada, sem a sua duplicação no rodapé da conta. O catálogo preserva o parâmetro `isAlumni` para alunos com acesso Alumni.
- O menu inferior de conta mantém os mesmos destinos e aparece como painel compacto à direita.
- Modais não foram modificados; não interferir com a PR #272 do agente paralelo.

Evidência automatizada: `tests/routes/sidebar-nav.test.tsx` cobre abertura por clique e teclado, selecção de destino, exclusividade de flyouts, menu da escola e Escape. O hover está implementado para rato, mas requer confirmação visual no navegador (o ambiente jsdom não constitui prova física de ponteiro). O CI da PR deve comprovar lint, TypeScript, testes e build. A auditoria de dependências no CI sincronizado com `main` aprovou em 24/10/2026; a issue #273 permanece para confirmar a remediação dos avisos anteriormente observados. Não ignorar qualquer nova falha de segurança nem declarar produção sem o deploy e a auditoria pós-publicação aprovados. Interacção visual autenticada em dispositivos físicos e alternância entre escolas aguardam staging (#249).

## Alcance das categorias já existentes em Definições (25/10/2026)

[PR #286](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/286)
(`fix/settings-panels-handoff-20261025`), **merged em `main` a 25/10/2026**:
os painéis previamente registados `identidade` e `pedagogico` passam a estar
ligados ao menu raiz do `SettingsCenter`, junto da escola. Isto corrige
destinos órfãos sem criar um novo módulo ou mudar o sistema de permissões,
backend, RLS ou dados.

- **Implementado e integrado em `main`:** links dos painéis já existentes e
  contrato estático em `tests/ui/settings-panel-reachability.test.ts`.
- **CI da PR:** aprovado — auditoria de dependências, estilo/acessibilidade/build
  e lint/build do painel com `SUCCESS`; Lighthouse e E2E `SKIPPED` (só correm
  no push para `main`, não nas PRs).
- **Bloqueado até staging autorizado:** deep links em sessão Administrador,
  preferências modalidade página/modal, foco, scroll e isolamento ao mudar de
  escola, incluindo 390/768/1024/1440 px. Não inferir homologação com dados reais.
- Orientações para trabalho paralelo: `docs/agents/HANDOFF_SETTINGS_2026-10-25.md`.

## Context Engine — trabalho, pasta e submenus por hover (26/10/2026)

Ramo `claude/project-thread-vlrjln`, sobre o `main` com as #332, #337 e #348.

- Menu do trabalho (`/pedagogica/tarefas/$taskId`) e menu da pasta (`/arquivos?pasta=`) usam o
  mesmo `ContextEntityNav`: «Voltar», cabeçalho «Trabalho · ‹nome›» com a turma e a disciplina por
  baixo, grupos e linhas iguais aos dos outros contextos. Sem componentes visuais novos.
- Barra recolhida: com rato, o submenu de cada grupo abre ao apontar, à direita, e fecha 180 ms
  depois de o cursor sair (o mesmo atraso do menu da escola). Não reabre a sidebar em hover; toque
  e teclado continuam a abrir por toque/Enter. Expandida, mantém-se o acordeão.
- Evidência: `tests/routes/sidebar-nav.test.tsx` (hover com rato, toque sem hover, menus do
  trabalho e da pasta). Falta confirmação visual autenticada e em aparelhos.

## Presença do professor na sala (26/10/2026)

Acrescentos pequenos dentro de ecrãs existentes, sem modais novos: uma linha de estado
(«Professor na sala», «Por confirmar», «Sem presença»…) e o botão «Estou na sala» nas aulas
do portal do professor, em `/professor/presenca` e no cabeçalho da chamada; nome do professor
e contagem do dia nas aulas de Pedagógica → Presenças; registo pela Direcção em linha, com
motivo. Evidência automatizada: `tests/routes/professor-presenca.test.tsx` e
`tests/pedagogica/teacher-presence.test.ts`. **Por validar no navegador:** 390/768/1440 px
numa sessão autenticada de professor e de Direcção, depois de aplicado o SQL.

## QR da escola para a presença (26/10/2026)

`/pedagogica_/presenca-docente` ganha o painel «QR da escola» (três cartões de estado,
definições com o modo em três opções, zona GPS, interruptores) e «Leituras de hoje» com
confirmar/recusar em linha. O ecrã do QR é uma camada de ecrã inteiro (fundo da app, hora
grande, QR com barra de tempo, aviso «Sem internet: o QR continua válido»), não um modal. No
professor, um bloco «Ler QR da escola» com câmara e cartão de resultado (verde/âmbar/vermelho)
em `/professor/presenca`. App Flutter: ecrã «Presença na sala» com cartão em gradiente da cor de
acção, câmara com moldura e linha animada (desliga com movimento reduzido), folha de resultado.
Evidência: `tests/pedagogica/school-qr.test.ts`, `mobile-flutter/test/presence_test.dart`,
`flutter analyze`/`build web` limpos. **Por validar no navegador e num telemóvel Android de
entrada**, com sessão autenticada.

Revisão por capturas (dados simulados, 390/768/1440 px, claro e escuro; app Flutter web em
390 px): corrigidos o contraste do botão «Ler QR da escola» no tema escuro da app, a coluna de
horas das aulas (início em destaque, fim por baixo, atraso a âmbar) e a falta de confirmação
antes de «Anular todos os QR» (agora pede um segundo toque). Não substitui a validação com
sessão autenticada.

Resumo da semana (26/10): painel na mesma página, depois de «Leituras de hoje». Quatro cartões
(aulas, % com presença, sem presença, chamadas sem presença), navegação por semana, CSV e uma
linha por professor com etiquetas só para o que precisa de atenção e barra da percentagem
(verde ≥ 90 %, âmbar ≥ 70 %, vermelho abaixo). Na lista de leituras, «Mesmo telemóvel que …» a
âmbar. Capturas com dados simulados em 390/1440 px e escuro a 768 px.

Limpeza visual (26/10, pedido do proprietário «eliminar a poluição visual»): em
`/pedagogica_/presenca-docente` os três cartões de estado do QR passaram a uma linha de
etiquetas e as definições ficam recolhidas atrás de «Definições» (abertas só enquanto falta a
zona); a impressão é um só botão com «Esta semana»/«Próxima semana»; sem coordenadas no ecrã;
descrições de uma frase (sem «Saber mais»). «Leituras de hoje» mostra primeiro o que pede
decisão, com motivos curtos sem repetir a linha, e recolhe as aceites («N leituras aceites ·
Ver»). O resumo da semana tem «X de Y aulas» e etiquetas só para o que precisa de atenção. O QR
por aula do RH fica recolhido no fim da página. App: sem título repetido no cartão, sem as três
dicas no fundo, e a sala aparece como vem do horário («Sala 12», não «Sala Sala 12»). A página
da Direcção ficou com cerca de metade da altura a 1440 px.

Segunda passagem (26/10): portal do professor sem o painel do QR do RH quando o professor não
tem aulas de hora/aula (o atalho da agenda continua a abrir a chamada); em modo QR, sem o botão
«Ler QR da escola» repetido em cada aula (o leitor está no topo do painel); sem botões
«Actualizar» (as listas refrescam sozinhas a cada minuto); o próprio professor lê «Na sala» em
vez de «Professor na sala», sem o método; o resumo de Pedagógica → Presenças mostra só as
categorias com casos; salas pelo `roomLabel` partilhado («12» → «Sala 12», «Sala 4» e
«Laboratório» ficam), também na app.

App de computador (26/10, pedido do proprietário): ícones da app Tauri trocados pelo «S» em
squircle da web (saíram os do capelo amarelo) e página pública `/transferir` (também em
Definições → App para computador): um botão para o sistema de quem visita, com formato, tamanho
e versão, passos de instalação recolhidos, os outros sistemas numa lista e, no telemóvel, só a
lista com um aviso de que a app é para computador. No ecrã de entrada, a ligação «Transferir a
app para computador» aparece a partir de 768 px e nunca dentro da própria app. Capturas a
390/1440 px e escuro a 768 px em `/mnt/project-files/desktop/`.

`/transferir` com Android (26/10): a página passou a ter as duas apps, a do aparelho de quem
visita primeiro. No Android o cartão «SIGA Plus para Android» (APK de 64 bits, ligação discreta
para o de 32 bits, passos e certificado recolhidos) vem em cima e destacado; no computador fica
por baixo com o botão em contorno. Definições → «Apps do SIGA»; no ecrã de entrada a ligação
«Transferir a app do SIGA» aparece em todos os tamanhos (fora da app de computador).

## Contraste dos tokens e tamanho tipográfico (30/10/2026)

Estado: **parcial**. A PR #419, integrada em `6e4aed3`, mede 78 pares de tokens,
corrige 10 das 16 falhas numéricas e isenta seis pares de separadores decorativos.
Altera também a raiz de 11px para 11,5px na faixa 1024–1535px. Não foi apenas
uma alteração de tokens de cor. O JSON `contrast-tokens.json` conserva essa
fotografia histórica.

A revisão dos consumidores encontrou contraste insuficiente no uso de
`text-destructive` no tema escuro (4,06:1 na página, 3,70:1 no cartão) e hover
translúcido fora da cobertura inicial. Implementado no ramo de revisão: migrar o texto para
`text-destructive-strong` e usar hover destrutivo opaco, sem alterar dados,
permissões, handlers ou dimensões. Cobertura de regressão inclui fundos tintados
e impede a reutilização do preenchimento como texto em `src/`.

A evidência tipográfica foi corrigida: `text-xs` já tinha mínimo de 11px,
`text-sm` 12px, `text-base` 13px e `text-lg` 14px. Os 8,25/8,63px não eram o
tamanho das classes. A raiz afecta também espaçamentos e dimensões em rem.

Prova e limites: [relatório 2.2](VISUAL_2026-10-30_FASE_2-2.md),
`evidence/2026-10-30/typography-scale.json` e
`tests/ui/theme-token-contrast.test.ts`. Falta validação de páginas renderizadas
em sessão autenticada, dispositivos físicos, zoom/reflow, SVG, imagens,
hierarquia e marcas personalizadas. Não declarar conformidade integral WCAG.

Verificação local desta revisão: `npm test -- --maxWorkers=4` — 804 ficheiros
aprovados, 3 ignorados; 5.696 testes aprovados e 25 ignorados. Após acrescentar
os quatro casos que seguem as classes hover de Button/Badge, execução específica:
`vitest run tests/ui/theme-token-contrast.test.ts` — 119 aprovados e seis
isenções. Repor temporariamente o hover antigo reproduziu duas falhas no tema
claro; os ficheiros finais foram restaurados. O teste novo também falhou antes
da correcção dos consumidores e da evidência tipográfica.

`npm run build`, `npm run typecheck`, `npm run check:style` (65/65 rotas) e
`npm run lint` aprovados; lint com 58 avisos, zero erros. CSS compilado pelo
Tailwind confirma o mapeamento de texto strong, fundo original, hover novo e
mínimo `text-xs` de 11px. Uma comparação automática dos 148 ficheiros de origem
alterados confirma apenas as substituições de classes previstas e formatação.
Sem navegador Chromium instalado neste executor: não houve capturas nem prova
visual renderizada. Não houve merge, deploy, SQL ou escrita de dados escolares.

## Etiquetas de alunos — revisão adicional de contraste (30/10/2026)

Estado: **parcial**, implementado e testado localmente; sem publicação.
`StudentFinanceBadge`, `StudentStatusBadge` e o mapa de pagamentos da lista de
alunos mantêm fundos, contornos, tamanhos, rótulos e estados. Só os textos
passam para os tokens strong adequados. Corrigida a reutilização de
`warning-foreground` sobre fundo warning translúcido no tema escuro.

O teste lê os mapas dos consumidores e mede os 15 estados nos dois temas e
sobre página/cartão (60 casos). Antes: 23 falhas; depois: todos passam.
`vitest run tests/ui/theme-token-contrast.test.ts tests/students
 tests/ui/shared-list-controls.test.tsx tests/ui/education-workflow-visual.test.ts`:
26 ficheiros, 349 testes aprovados, seis isenções decorativas. O teste de tema
tem agora 179 aprovados e seis isenções. Lint dos quatro ficheiros de código e
check:style aprovados. Marca personalizada, renderização autenticada,
zoom/reflow e aparelhos físicos continuam sem validação neste ciclo.

Build e tipos desta revisão: as execuções simultâneas foram terminadas com 137
por falta de memória (dois eventos OOM kill registados no cgroup). Repetidos
sequencialmente com `NODE_OPTIONS=--max-old-space-size=3072`: `npm run build`
e `tsc --noEmit` aprovados. Nenhuma validação foi desactivada.
