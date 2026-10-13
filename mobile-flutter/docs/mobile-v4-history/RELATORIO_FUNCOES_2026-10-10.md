# SIGA Plus Mobile V4 — consultas e chat institucional

Repositório `fernandotunas6-bot/onsoft-replica-dev`, branch `feat/siga-plus-mobile-v4-isolated`, PR #116. Continuação do commit `b436a5f7b492c1ed827e64da7b3a78544ab24566`. Fonte institucional: Sga `xodgfmxiaunpamctfeea`, sessão e MFA existentes. Nenhuma migração ou escrita de dados de produção foi executada neste ciclo. O portal principal e o seu modo institucional permanecem sem publicação/activação.

## Funções implementadas

| Serviço                  | Comportamento e fonte real                                                                                                                 | Limite actual                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Calendário e presenças   | Mapa mensal com sessões de chamada e ocorrências docentes próprias; estados e datas armazenados                                            | Não é um calendário de feriados/eventos escolares completos                                                                  |
| Horário                  | Horários publicados e registos anteriores identificados, filtros de dia/disciplina                                                         | Um horário não confirma uma aula realizada                                                                                   |
| Próximas aulas           | Próximos períodos do horário publicado, validade e relógio de Luanda, até 14 dias                                                          | Não deduz feriados/cancelamentos ausentes da fonte                                                                           |
| Disciplinas matriculadas | Matrículas activas, turmas e disciplinas canónicas                                                                                         | Aluno não recebe listas de colegas                                                                                           |
| Tarefas/trabalhos        | Consulta das tarefas publicadas autorizadas, instruções e prazo                                                                            | Publicação e entregas institucionais por concluir                                                                            |
| Notas do professor       | Diários atribuídos, períodos, componentes, máximo real, notas e estados, pesquisa/actualização                                             | Apenas consulta; diário fechado não é apresentado como pauta publicada                                                       |
| Notas do aluno           | Pautas próprias efectivamente publicadas                                                                                                   | Sem conversão de notas ou publicação artificial                                                                              |
| Propinas                 | Facturas e recibos das matrículas próprias, incluindo anteriores; filtros e recibos estornados                                             | Valores calculados a partir dos recibos identificados como tal; não substituem reconciliação financeira                      |
| Propinas pagas           | Facturas marcadas `paid` na fonte e respectivos recibos                                                                                    | Não presume pagamento pelo clique num botão                                                                                  |
| Pagamento                | Ligação ao portal existente PayFlow `/aluno/pagar`; URL respondeu HTTP 200                                                                 | Requer credenciais de pagamento da escola; não foi efectuado pagamento real nem integração de checkout/webhook dentro do PWA |
| Conversas                | Directas/grupos em que a pessoa participa na escola seleccionada, pesquisa, histórico paginado, respostas, eliminadas e estados de leitura | Nenhuma conversão ou cópia de conversas fictícias para o Sga                                                                 |
| Anexos recebidos         | Verifica conversa, escola, participante e permissões actuais de quem enviou antes de assinar por 600 segundos                              | Storage real positivo não ensaiado com contas reais; upload/envio de novos anexos pendente                                   |
| Contactos                | Vínculos activos e cargos da escola; alunos vêem apenas pessoal autorizado                                                                 | Não usa `profiles.cargo` para autorizar                                                                                      |
| Alterações do chat       | Subscrição do SDK registada antes de `subscribe`, invalidação e nova leitura HTTP autenticada; polling visível de reserva                  | Entrega Realtime real e políticas da publicação ainda por validar com contas autorizadas                                     |
| Comandos do chat         | Enviar, responder, eliminar mensagem própria, marcar leitura até mensagem apresentada e iniciar/reutilizar conversa                        | Preparados e ensaiados localmente; desactivados no preview enquanto a RPC não estiver instalada num ambiente autorizado      |

## Escritas e migração isolada

`staging/database/supabase/migrations/20261010083336_mobile_v4_chat_commands.sql` foi criado pelo CLI Supabase e fica fora da fila de migrações do portal principal. **Não aplicar à produção.** Não foi criado um projecto pago nem uma branch remota da base.

A RPC usa `SECURITY INVOKER`, acesso exclusivo de `service_role`, autorização activa por escola/cargo, verificação da conversa, autor e destinatário, chave de idempotência por escola/utilizador/pedido, serialização por chave e auditoria na mesma transacção. A tabela de pedidos tem RLS activado e forçado, sem acesso de `anon`/`authenticated`. A auditoria não copia corpos de mensagens. Se o pedido falhar, mensagem, auditoria e chave são revertidos; repetir um pedido não duplica a mensagem; mudar o conteúdo com a mesma chave devolve conflito.

O adaptador HTTP exige sessão verificada, escola/cargo seleccionados, permissão do módulo, MFA `aal2` nas escritas, origem correcta e corpo estrito. Não usa `user_metadata` para autorizar. O browser só habilita comandos depois de consultar a capacidade real da RPC; função ausente significa escritas indisponíveis. Nunca substitui a RPC por inserts antigos sem auditoria.

Endereços HTTP novos, sob `/api/mobile-v4/schools/:schoolId/`: `gradebooks`, `finance`, `chat`, `contacts`, `attachment`, `chat-capabilities` (GET) e `chat-commands` (POST). A identidade vem exclusivamente do bearer verificado. Todas as respostas são privadas e `no-store`.

## Verificação efectuada

- Mobile: 187 testes em 15 ficheiros; tipos, ESLint, formatação, build PWA e verificação de cache/manifesto.
- Repositório completo: 3.357 testes passaram; 19 testes ignorados em 3 ficheiros. Tipos com heap de 6 GiB, build completo e ESLint dos ficheiros envolvidos passaram. Os testes jsdom existentes registaram uma mensagem de navegação não implementada sem falha da suite.
- Todos os scripts `tests/sql/*.mjs` passaram numa base PGlite local. A projecção Mobile tem 100 verificações; comandos do chat têm 26. A migração proposta correu duas vezes e foi ensaiada com o trigger real de integridade do chat.
- Paginação testada com mensagens distintas dentro do mesmo milissegundo: preserva os microssegundos PostgreSQL e não perde linhas no cursor.
- Módulo institucional compilado: percursos controlados de professor/aluno em Chromium a 390/768/1280 px, com SDK injectado e respostas HTTP de ensaio identificadas. Escola → calendário → disciplinas/tarefas → diários ou pautas/propinas → chat, filtros e actualização, sem erros JS ou transbordamento horizontal.
- Worker local compilado: endpoints anónimos recusados com 401; login institucional renderizado nas três larguras.
- O CSS e o conjunto de SVGs não foram alterados; o CSS compilado continua `index-Nj-rP-jw.css`, 22,13 kB. Corrigido o alias do build institucional para reutilizar a resolução PayFlow do ecossistema.

Os testes controlados e o PGlite **não equivalem a percursos positivos reais com Auth/MFA/PostgREST/Storage/Realtime**, nem ensaiam concorrência PostgreSQL com múltiplas ligações. Publicação e resultados do preview deste commit ficam identificados no PR #116.

## Pendências concretas

1. Instalar e validar a migração proposta numa base autorizada de testes, compatível com o esquema Sga completo; validar grants, índices existentes, advisors, concorrência e retenção da tabela de idempotência.
2. Ensaiar login/TOTP/renovação, revogação de vínculo, consultas, chat e anexos com contas reais autorizadas de professor e aluno. Sem essas contas, nenhuma validação positiva de produção foi declarada.
3. Completar uploads/envio de novos anexos, notificações institucionais/push, tarefas/entregas, planos, documentos oficiais, registo de presenças e notas com persistência atómica equivalente.
4. Validar a experiência de pagamento e o retorno/reconciliação do PayFlow; não foi efectuado pagamento nem criada transacção financeira de teste na produção.
5. Validar feriados/eventos do calendário institucional, dispositivos físicos, acessibilidade assistiva e instalação/offline. O preview ligado ainda não fornece o service worker do shell de demonstração.

A publicação autorizada neste ciclo destina-se exclusivamente à branch Pages `staging-mobile-v4-pr116`. A branch de produção do projecto Pages é a branch Git de desenvolvimento: nunca usar essa branch como argumento de deploy. Antes/depois do deploy, confirmar que a publicação canónica de produção `17570c06-7e08-44d9-a05d-1bfc04011dfe` não mudou.
