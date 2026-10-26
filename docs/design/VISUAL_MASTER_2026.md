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
