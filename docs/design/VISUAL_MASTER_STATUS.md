# Execução do padrão visual — 23/10/2026

Contrato: [VISUAL_MASTER_2026.md](VISUAL_MASTER_2026.md). Esta matriz acompanha
**todas as dez fases**. O padrão está registado; a execução integral está parcial.
Não considerar o sistema todo validado por causa dos testes abaixo.

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
| 2.2 — tipografia/nitidez        | por auditar | Inter e tokens preservados; falta medir contraste, imagens, SVG, pesos, densidade e hierarquia em todas as páginas.                                                                                                                                                         |
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
