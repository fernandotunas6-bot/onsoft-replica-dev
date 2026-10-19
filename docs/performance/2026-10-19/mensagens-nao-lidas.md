# Desempenho — resumo de mensagens não lidas

O sino (`AppShell`), a coluna (`RightRail`) e a lista de colegas (`StaffMessenger`)
consomem `useInboxUnread`. A leitura já partilhava uma chave React Query por conta,
mas cada montagem criava um canal próprio e invalidava directamente a mesma cache
em cada evento. Agora o canal pertence ao par QueryClient/conta e conta consumidores:
desmontar um conserva o canal dos restantes; o último remove-o e cancela trabalho
pendente. Um UUID no nome evita reutilizar um canal ainda em remoção.

O resumo reutiliza o agrupador Realtime de 300 ms existente, sem cancelar e
recomeçar leituras lentas a cada evento. Os eventos de mensagens continuam em
`siga_chat_messages` e a leitura própria continua em `siga_chat_members` com filtro
`user_id`. Chaves, apresentação das não lidas, RLS e funções de servidor preservadas.
Não foi aplicado SQL nem enviada qualquer mensagem real.

## Verificação

Passaram 58 testes em nove ficheiros, incluindo oito testes novos com React Query
real e um transporte Realtime simulado:

- Três consumidores: um canal e uma leitura inicial.
- Uma resposta nova actualiza os três consumidores, incluindo contagem e última mensagem.
- Sair de um consumidor mantém o canal dos restantes; o último cancela a fila.
- 500 eventos geram uma actualização; mais 500 durante uma leitura lenta conservam
  uma actualização final, sem reiniciar a leitura em curso.
- Troca de conta remove a ligação anterior e aplica o filtro da conta nova.
- Caches distintas mantêm subscrições e invalidações separadas.
- Remontagem StrictMode não reutiliza um canal ainda em remoção.
- Sem conta, não se cria canal nem se consulta o servidor.

Também passaram os testes existentes de mensagens, agrupamento Realtime, âmbito de
mensagens e orçamento do primeiro desenho. Lint dos três ficheiros de código/teste
sem achados. Estes ensaios não certificam uma sessão autenticada em produção nem
representam uma medição de INP/LCP de campo.

O build completo com `SIGA_NITRO_PRESET=node-server` passou; esse preset é apenas
para validar e servir o build localmente neste Mac.
A verificação global de tipos (`npm run typecheck`) terminou com código 0.

Referências consultadas: [ciclo de vida do canal](https://supabase.com/docs/reference/javascript/removechannel)
e [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
