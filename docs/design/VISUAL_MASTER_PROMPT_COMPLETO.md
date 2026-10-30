# SIGA Plus — prompt master do visual, completo

Ficheiro de trabalho gerado em 30/10/2026, regenerado no mesmo dia após a medição da fase 2.2. Junta, **sem alterar uma palavra**, os
dois documentos que regem o refinamento visual:

- **Parte I — o contrato:** `VISUAL_MASTER_2026.md`, aprovado pelo proprietário em
  23/10/2026 (último commit `faa4784d`, 23/10). Diz o que fazer.
- **Parte II — a matriz de execução:** `VISUAL_MASTER_STATUS.md` (último commit
  `bf05e866`, 26/10). Diz o que já está provado e o que não está.

Os dois ficheiros originais continuam a ser a fonte de verdade; este é uma cópia
para colar como prompt. As ligações internas da Parte I para
`VISUAL_MASTER_STATUS.md` referem-se à Parte II deste ficheiro.

## Começar por aqui — nenhuma fase está concluída

Estado das dez fases à data da Parte II. Ordem de ataque sugerida, do mais
descoberto para o mais adiantado:

| Ordem | Fase | Estado | Porque está aqui |
| --- | --- | --- | --- |
| 1 | 2.2 — tipografia/nitidez | parcial | Contraste e tamanho tipográfico medidos em 30/10 (6 falhas AA corrigidas, ver Parte II). Faltam imagens, nitidez de SVG, pesos e hierarquia página a página. |
| 2 | 5.2 — backend/dados | **bloqueado** | Falta acesso de teste autorizado para medir consultas, índices, cache e payload sem escrever em escolas reais. |
| 3 | 5.3 — objectivos mensuráveis | **bloqueado** | INP/LCP/CLS p75 e FPS reais exigem ambiente instrumentado e amostra adequada. |
| 4 | 7 — dispositivos e browsers | parcial | Só Chromium headless em componente isolado. Faltam Android/iOS/tablets físicos, Safari/Edge/Firefox, orientação, zoom e rede lenta. |
| 5 | 2.3 — componentes universais | parcial | Os modais estão refinados; inputs, selectores, listas, filtros, paginação, pesquisa, calendário, abas, notificações, estados e dashboards não. |
| 6 | 6 — módulos | parcial | As melhorias partilhadas propagam, mas a auditoria módulo a módulo do inventário não está fechada. |
| 7 | 2.1 — superfícies | parcial | Definições e PremiumModal feitos; cartões, bordas, sombras e alinhamentos por rever em cada módulo. |
| 8 | 4.1 / 4.2 / 4.3 — interacções, animações, toque | parcial | Cobertos três formulários e as categorias ≥44 px; faltam skeletons, scroll, cache de filtros, durações/frames e duplo envio nos restantes. |
| 9 | 3 — navegação contextual | parcial | Menu compacto entregue; faltam todos os contextos, cabeçalhos, escola activa, rotas e teclado virtual. |
| 10 | 1, 5.1, 8, 9, 10 | parcial | Auditoria runtime, baseline de produção, leitores de ecrã/AA, isolamento com duas escolas e percursos reais completos. |

**O travão que atravessa tudo:** validação visual em sessão autenticada, em
dispositivos físicos e com troca de escola, nas larguras 390/768/1024/1440 px,
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

---

**PARTE II — A MATRIZ DE EXECUÇÃO** · `docs/design/VISUAL_MASTER_STATUS.md`, verbatim

---

# Execução do padrão visual — 23/10/2026

Contrato: [VISUAL_MASTER_2026.md](VISUAL_MASTER_2026.md). Esta matriz acompanha
**todas as dez fases**. O padrão está registado; a execução integral está parcial.
Não considerar o sistema todo validado por causa dos testes abaixo.

**25/10/2026 — backend de horários/calendário:** agenda autenticada, sincronização
de presenças e migrações verificadas; [evidência e limites](../architecture/ACADEMIC_AGENDA.md).
Sem mudanças visuais e sem montagem de FullCalendar nas páginas. Os estados
visuais dos módulos abaixo mantêm-se; este ciclo não constitui validação de UI.

## Diagnóstico por prioridade

| Prioridade / natureza  | Evidência inicial                                                                                       | Correcção / estado                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P1 funcional / visual  | `/configuracoes` redireccionava sempre para `/` e para um modal grande.                                 | Página por omissão; opção `settingsModal` na preferência existente da escola.                                  |
| P1 visual / interacção | Menu recolhido voltava a expandir com hover, mudando a largura do conteúdo.                             | Compacto por omissão; expansão por botão; opção `expandedSidebar` por escola.                                  |
| P1 funcional           | `StackNav.close` capturava estado dirty antigo; trocar categoria ignorava alterações pendentes.         | Guarda actualizada e testes de confirmação; navegação para fora da página usa bloqueador do router.            |
| P1 funcional           | Pedido de abrir definições sem painel devolvia o mesmo `undefined` que ausência de pedido.              | Pedido raiz representado por string vazia e consumido uma só vez.                                              |
| P1 funcional           | FormModal/QuickModal não bloqueavam directamente Enter repetido nem `disabled` no handler.              | Bloqueio síncrono até à resolução do callback, incluindo WizardModal; feedback de operação pendente.           |
| P2 acessibilidade      | Categorias das Definições tinham alvos com 27–32,14 px de altura no ensaio.                             | Altura mínima de 44 px, confirmada nas seis larguras.                                                          |
| P2 visual              | PremiumModal tinha halo desfocado, sombra forte e destaque decorativo; wizard simples usava largura xl. | Cabeçalho neutro e sombra suave; wizard sem painel visual usa lg, preservando campos e acções.                 |
| P1 auditoria restante  | Existem outros consumidores com tamanho xl/2xl/full.                                                    | **Fechado em 25/10/2026** — os 7 candidatos do inventário `evidence/2026-10-23/large-modal-inventory.json` têm veredicto: 4 migrados para página (`StudentExtensiveModal` → `/alunos/$studentId`, `TurmaProfileModal` → `/pedagogica/turmas/$turmaId`, `PersonWizardModal` → `/pessoas/novo`, `PersonProfile360Modal` → `/pessoas/$personId`), 2 justificam o tamanho (`MoreHub`, `PrintTemplateStudio`), 1 já estava corrigido (`AssignTeacherForm`). Nos quatro migrados, os formulários pequenos e confirmações continuam em modal, como o contrato permite. Falta validação visual em sessão autenticada para todos — bloqueada pelo MFA nesta sessão. |
| P1 desempenho          | Inventário actual de preloads gerado para 18 módulos.                                                   | Diagnóstico de bytes disponível; latências e gargalos de rede/re-render ainda por medir em sessão autenticada. |

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

| Módulo                                    | Estado      | Fonte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Próximo passo                                                                      |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dashboard (`dashboard`)                   | parcial     | `src/routes/index.tsx`, `src/features/dashboard/portals/AdminPortalDashboard.tsx`. Auditoria de código (25/10/2026): (1) `stats`/`miniStats`/`toneBg`/`dotTone`/`DashboardGreeting` e os lazy imports `DashboardCharts`/`DashboardAgeChart`/`TeacherWorkspacePanel` em `index.tsx` são recomputados mas nunca usados no JSX — duplicam o que já existe em `AdminPortalDashboard.tsx`; (2) cartões de estatística (`AdminPortalDashboard.tsx:680,687,699`) usam `hover:scale-[1.02]` sem `motion-reduce:`, ao contrário de `Button`/`tooltip`/`alert-dialog`; (3) `tests/visual/{baseline,current}/dashboard.png` são de 10–16/08 e `dashboard_debug.png` de 08/09 — anteriores ao padrão visual e à página de login actual, não servem de prova. | Login autenticado bloqueado por falta de código MFA nesta sessão; falta validação visual real (390/768/1024/1440px), renderização dos gráficos (`DashboardCharts`) com dados reais e gerar novas capturas de regressão. |
| Alunos / matrículas internas (`alunos`)   | por auditar | `src/routes/alunos/index.tsx`, `src/routes/alunos/$studentId.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Auditar com dados controlados e perfil autorizado.                                 |
| Alumni / antigos alunos (`alumni`)        | por auditar | `src/routes/alumni.tsx`, `src/routes/alumni.$alumniId.tsx`, `src/routes/alumni.$alumniId.portfolio.tsx`, `src/routes/alumni.portal.tsx`, `src/routes/alumni.portal.portfolio.tsx`, `src/routes/alumni.portal.portfolio.showcase.tsx`, `src/routes/alumni.portal.portfolio.print.tsx`, `src/routes/alumni.insights.tsx`, `src/routes/alumni.operations.tsx`, `src/routes/alumni.communications.tsx`, `src/routes/alumni.matching.tsx`, `src/routes/alumni.documents.tsx`, `src/routes/alumni.calendar.tsx`, `src/routes/alumni.pipeline.tsx` | Auditar com dados controlados e perfil autorizado.                                 |
| Pessoas e professores (`pessoas`)         | por auditar | `src/routes/pessoas/index.tsx`, `src/routes/professores/$teacherId.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Auditar com dados controlados e perfil autorizado.                                 |
| Área pedagógica / turmas (`pedagogica`)   | por auditar | `src/routes/pedagogica.tsx`, `src/routes/relatorios.academicos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Auditar com dados controlados e perfil autorizado.                                 |
| Tesouraria e faturas (`financeiro`)       | por auditar | `src/routes/financeiro.tsx`, `src/routes/faturas.tsx`, `src/routes/relatorios.financeiros.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                              | Auditar com dados controlados e perfil autorizado.                                 |
| RH, assiduidade e folha salarial (`rh`)   | por auditar | `src/routes/financeiro.rh.tsx`, `src/routes/financeiro.rh.folha.tsx`, `src/routes/financeiro.rh.faltas.tsx`, `src/routes/financeiro.rh.presenca.tsx`, `src/routes/financeiro.rh.pagamentos.tsx`, `src/routes/professor.presenca.tsx`                                                                                                                                                                                                                                                                                                        | Auditar com dados controlados e perfil autorizado.                                 |
| Documentos (`documentos`)                 | por auditar | `src/routes/documentos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Auditar com dados controlados e perfil autorizado.                                 |
| Calendário e ICS (`calendario`)           | por auditar | `src/routes/calendario.tsx`, `src/routes/calendario.ics.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Auditar com dados controlados e perfil autorizado.                                 |
| Comunicações (`comunicacoes`)             | por auditar | `src/routes/comunicacoes.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Auditar com dados controlados e perfil autorizado.                                 |
| Acessos, grants e 2FA (`acessos`)         | por auditar | `src/routes/acessos.tsx`, `src/routes/alterar-senha.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Auditar com dados controlados e perfil autorizado.                                 |
| Matrícula pública (`matricula`)           | por auditar | `src/routes/matricula/$slug.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Auditar com dados controlados e perfil autorizado.                                 |
| Integrações catalog-ready (`integracoes`) | por auditar |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Auditar com dados controlados e perfil autorizado.                                 |
| Arquivos (`arquivos`)                     | por auditar | `src/routes/arquivos.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Auditar com dados controlados e perfil autorizado.                                 |
| Planos de Aula (`lesson-plans`)           | por auditar | `src/routes/planos-aula.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Auditar com dados controlados e perfil autorizado.                                 |
| Motor Central de Importação (`importar`)  | por auditar | `src/routes/importar.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Auditar com dados controlados e perfil autorizado.                                 |
| Catracas e Cartão Virtual (`catracas`)    | por auditar | `src/routes/catracas.tsx`, `src/routes/api/catracas/device-scan.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Auditar com dados controlados e perfil autorizado.                                 |
| SaaS Control Center (plataforma) (`saas`) | por auditar | `src/routes/saas-admin.tsx`, `src/routes/criar-escola.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Auditar com dados controlados e perfil autorizado.                                 |
| Configurações                             | parcial     | `src/routes/configuracoes.tsx`, `SettingsCenter`, `StackedModal`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Validar persistência por escola e todos os painéis com conta autorizada.           |
| Website escolar                           | por auditar | `src/features/school-website` e `painel/escolas`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Conservar identidade; testar portal, responsividade e configuração.                |
| Relatórios                                | por auditar | Rotas académicas/financeiras existentes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Filtros, grandes volumes e progresso de exportação.                                |
| Flutter                                   | por auditar | `mobile-flutter` se presente na revisão seguinte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Confirmar implementação existente e validar separadamente em dispositivos nativos. |

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

| Área | Ajuste dirigido | Prova e limite |
| --- | --- | --- |
| Navegação | Linhas raiz e subitem com alvo mínimo de 44 px em ecrãs estreitos; em desktop (lg) mantêm a densidade original 36/32 px | Contrato em `tests/ui/compact-sidebar-modal-touch.test.tsx`; testar 390/1024 px com sessão no staging |
| Diálogos simples | Acções no rodapé com alvo mínimo de 44 px, sem alterar os dois botões, labels ou `onOpenChange` | Teste de semântica com `Dialog` existente |
| PremiumModal | Sombra leve e rodapé neutro; continuam campos, título, descrição, botões e scroll existentes | Teste DOM; sem conversão de matrículas/finanças em modal simplificado |

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

## Contraste dos tokens e tamanho tipográfico (30/10/2026)

Primeiro trabalho registado na fase 2.2, que estava `por auditar`. Não altera
componentes, layout, rotas, dados nem permissões: só nove valores de token em
`src/styles.css`, mais um teste e a prova.

- **Corrigido e verificado:** 6 das 14 falhas de contraste WCAG 2.2 AA. As que
  importavam estavam na variante base do `Button` e do `Badge` — todo o botão e
  etiqueta destrutivos do sistema estavam a 4,40:1 (claro) e 3,34:1 (escuro).
  Agora 4,51:1 nos dois temas. Matiz preservada; `--primary` não foi tocado.
- **Alterados em conjunto** `--success`/`--chart-3`, `--info`/`--chart-5` e
  `--warning`/`--chart-4`, que partilhavam o valor exacto, para não criar dois
  verdes, dois azuis e dois âmbares. `--warning-foreground`/`--warning` desceu
  de 7,15 para 5,20 — medido, continua acima de 4,5.
- **Isento com razão escrita:** `--border` e `--sidebar-border` (1,21–1,42).
  São separadores decorativos; 1.4.11 não exige 3:1 e o contrato pede bordas
  subtis. Registado como isenção no teste, não como dívida.
- **Decidido pelo proprietário no mesmo dia e aplicado:** o contorno dos campos
  foi escurecido — `--input` de `oklch(0.918 0.008 286)` para
  `oklch(0.65 0.008 286)` no claro e de 16% para 34% de branco no escuro —
  passando a 3,07–3,24:1 contra a página e contra o cartão nos dois temas.
  `border-input` está em 71 ficheiros, pelo que a mudança atravessa todos os
  formulários: foi a escolha explícita. `--input` deixa de ser igual a
  `--border`, que fica subtil como estava.
- **Decidido e aplicado:** a raiz tipográfica de 1024–1535px subiu de 68,75%
  para os 71,875% que já vigoravam acima de 1536px, unificando as duas consultas
  numa só. O portátil deixa de ser a largura mais apertada das três: 11px → 11,5px,
  +4,5% de texto, sem tocar no telemóvel nem no monitor. Não torna o `text-xs`
  confortável (8,25px → 8,63px); subir os consumidores de `text-xs` para
  `text-sm` continua disponível e não foi escolhido.
- **Prova:** `evidence/2026-10-30/contrast-tokens.json` (76 pares, antes e
  depois) e `evidence/2026-10-30/typography-scale.json`. Teste verificado a
  falhar com os valores antigos antes de se dar por bom.
- **Continua por auditar nesta fase:** imagens, nitidez de SVG, pesos e
  hierarquia página a página, contraste sobre gradientes e Aurora, e o efeito da
  marca escolar personalizada. 22 dos 76 pares usam um token fora do gamut sRGB,
  `--primary` escuro incluído: a cor mostrada é o corte, não a declarada.

Sem validação em sessão autenticada nem em dispositivo físico: a medição é sobre
os tokens declarados, não sobre ecrãs renderizados. Não substitui a fase 8.
