# Backend institucional — implementação e detalhes

## Entrega local de 13/10/2026

Código executável em backend/api.ts; adaptador em
src/features/mobile-v4/institutional-extension.server.ts e montagem apenas no
Worker de staging mobile-v4/staging/worker.ts. Nenhuma publicação, alteração de
DNS, migração ou escrita na produção. Os testes usam dependências controladas.

GET /api/mobile-v4/schools/:schoolId/classes?role=aluno|professor
GET /api/mobile-v4/schools/:schoolId/classes/:classGroupId?role=aluno|professor

Resposta versionada (version=1), no-store, âmbito escola/papel. A identidade
vem exclusivamente do Bearer verificado; rejeita query desconhecida/duplicada,
origem externa, método de escrita e UUID inválido. Adaptador chama
loadMobileV4AcademicCatalog, que usa a autorização institucional existente.
Não aceita userId do cliente, não procura turma fora do catálogo autorizado.
Turma inexistente e turma fora do âmbito retornam o mesmo 404.

As respostas têm allowlist: nome/ID académico, disciplinas, nome do docente,
horários e tarefas autorizados. Não devolvem lista de alunos, userId de colegas,
campos privados ou campos futuros automaticamente. Falha de leitura não vira
resposta vazia. HTTP 401 sessão, 403 âmbito, 404 turma não disponível, 405 método,
422 entrada inválida, 503 falha de serviço/inconsistência. Erros internos não
expõem SQL, tokens, stack ou dados pessoais.

## Limites da montagem

O Worker existente mantém todos os outros endpoints. Esta extensão não está
montada nas rotas do portal nem publicada. A compilação completa do Worker e
verificação TypeScript ainda devem correr com as dependências do repositório;
os testes Node verificam o handler isolado, não a ligação Supabase remota.
O cliente Flutter continua a usar o catálogo académico existente; migração
para os endpoints de turma aguarda contrato integrado e build validada.

## Autenticação

Reutilizar Supabase SGA e guardas canónicas. A extensão não implementa um Auth
paralelo. Email/senha Flutter ainda precisa CAPTCHA da configuração actual.
ID curto/B.I. devem ser resolvidos por backend com school code inequívoco,
anti-enumeração, rate limit e erro uniforme; não criar pesquisa pública de
contas. OAuth Google necessita PKCE/callback permitido; MFA deve ser verificado
pelo servidor e escritas requerem aal2. Recuperação precisa fluxo anti-abuso e
invalidação de sessões conforme política existente. Refresh fica no SDK.

## Integrações

backend/integrations.ts acrescenta regras de capacidades por escola/versão,
configuração, autorização e consentimento. “Configurado” não significa
“operacional”: o conector real deve validar credencial/quotas antes da operação.
Allowlist HTTPS para Meet, URL de participante Zoom, convite WhatsApp e origem
BBB exacta. Não são conectores OAuth completos nem prova de fornecedor activo.
BBB deve emitir convite no servidor; não expor segredo/checksum de administração.
Não usar URL do anfitrião Zoom. Aplicar regra de turma/aula/participante ANTES de
emitir um link, e manter audit sem guardar tokens/URLs assinados completos.

Estados de conector previstos: disconnected, authorization_required,
configured, unavailable, operational (apenas após prova recente do fornecedor).
Segredos no servidor e rota de callback com state, expiração, protecção de
replay, scopes mínimos e auditoria. Renovação concorrente de token deve ser
serializada por escola/provedor; revogação não deve cair para permissões amplas.
Webhooks exigem assinatura, janela temporal, deduplicação e fila idempotente.

## Transporte

backend/transport.ts implementa guardas e validação, sem inventar tabelas:
vínculo activo, escola exacta, viagem atribuída e MFA/perfil para escrita;
posição ligada a escola+viagem+dispositivo, coordenadas/precisão válidas e
carimbo temporal limitado. live <=120s, stale, awaiting ou ended. GPS não prova
embarque. Valores e limites são escolhas iniciais do contrato, não requisitos
legais ou especificação de um fabricante.

Persistência futura exige: cadastro de dispositivos com credenciais revogáveis,
anti-replay/sequence, assinatura ingestão, limites por dispositivo, transacção
para eventos, auditoria atómica, assignments autorizados no servidor e retenção.
O TransportGrant nunca pode vir do JSON do cliente: deve ser derivado de
consulta autorizada incluindo relação encarregado-educando e viagem activa.
Alunos/encarregados não acedem a trajectos de terceiros. A posição deve ser
filtrada e minimizada; nenhuma coordenada real foi lida/gravada nesta entrega.

## Banco, operações e publicação

Sem nova migração nesta etapa. Antes de SQL confirmar snapshot e colunas no
SGA, tabelas sensíveis server-only, FORCE RLS e grants mínimos conforme regras
locais. Não usar is_school_member sozinho para dados privados ou escritas.
Comandos duráveis devem ter requestId, idempotência, controlo de versão,
transacção e auditoria que reverte o comando se falhar. Capacidade de chat
continua dependente da RPC instalada; não habilitar por toggle do frontend.
Pagamentos dependem de webhook/reconciliação, nunca de retorno do browser.

Verificar antes de publicar: build Worker/TypeScript, testes HTTP existentes,
sessão real/MFA/CAPTCHA, duas escolas e todos os perfis, turma revogada durante
consulta, RPC/Storage/Realtime, quotas, logs sem PII e reversão para preview
anterior. Nenhuma destas verificações remotas foi declarada concluída.

## Validação executada

Node 24: `node --test mobile-flutter/backend/*.test.mjs` — 20 testes aprovados.
Cobrem handlers/classes, dados privados, identidade/origem, escola/perfil,
falhas internas, transport grants, timestamps/coordenadas, capacidades e URLs.
Não cobrem RLS remota, concorrência PostgreSQL, OAuth nem dispositivos reais.

## Incremento de tarefas — 13/10/2026

GET /api/mobile-v4/schools/:schoolId/tasks?role=aluno|professor
GET /api/mobile-v4/schools/:schoolId/tasks/:taskId?role=aluno|professor

Reutilizam catálogo autorizado, mesma validação de sessão/origem/escola/perfil
e projecção explícita. Respostas não contêm feedback privado, alunos ou campos
extra. Tarefa inexistente/fora do âmbito retorna 404 TASK_NOT_AVAILABLE.
Catálogo com tarefas duplicadas, campos inválidos ou docente malformado falha
com 503. Sem submissões/escritas novas ou novas tabelas. Montagem no Worker
de staging local ampliada para tasks; nenhuma publicação.

24 testes Node aprovados; build Worker, TypeScript completo e ensaio remoto
continuam pendentes. Os quatro novos testes cobrem tarefas, campos privados,
recurso fora do âmbito, duplicação e docente malformado.

## Refinamento de capacidades e GPS

Integrações desconectadas ou sem autorização deixam de anunciar capacidades
utilizáveis; capacidades repetidas são deduplicadas. Links com fragmentos são
recusados. Transporte rejeita papéis desconhecidos mesmo em leitura. Ingestão
GPS exige timestamp com timezone explícita e relógio de validação válido.
28 testes Node aprovados; nenhum conector ou dispositivo real foi activado.

## Integração na main

A main não contém o backend Mobile V4 da PR #116. Por isso este incremento
na main inclui apenas mobile-flutter e a validação isolada; o adaptador
institutional-extension.server.ts e a alteração de staging/worker.ts ficam
na branch completa feat/siga-flutter-motion-2026. Os endpoints aqui descritos
não estão montados na main. Integrar a dependência e validar o Worker antes
de activá-los. Nenhum domínio ou banco foi alterado nesta integração.


## Incremento 5 — login institucional por B.I. (17/10/2026)

`backend/identity.ts`: `POST /api/mobile-v4/auth/identifier`, com
`{ identifier, password, captchaToken? }` e resposta `{ version: 1,
accessToken, refreshToken }`. Espelha as garantias do `signInWithIdentifierFn`
em `src/features/access/server.ts`, que é código real desta checkout:

- O e-mail resolvido nunca volta ao dispositivo; a resposta é só a sessão.
- Identificador desconhecido e senha errada dão exactamente a mesma resposta
  (401 `INVALID_CREDENTIALS`): não há enumeração de contas.
- `CAPTCHA_REQUIRED` é distinto de credenciais erradas — o projecto tem
  `security_captcha_enabled`, e o cliente tem de voltar a pedir o sinal em vez
  de acusar a senha.
- Limite consumido por endereço **e** por identificador, antes do resolvedor:
  muitos IPs não compram tentativas sem fim contra uma conta.
- 405 método, 403 origem externa, 415 media type, 422 entrada inválida ou campo
  desconhecido, 429 limite, 503 falha de serviço. Nenhuma recusa inclui SQL,
  tokens, stack, identificador ou senha.
- Uma concessão incompleta (200 sem refresh token utilizável) é 503, nunca uma
  sessão.

As dependências (`resolveEmail`, `passwordGrant`, `consumeRateLimit`,
`clientIp`) são injectadas: no SGA ligam a `resolveBiOrEmailToUserEmail`,
`passwordGrant` e `consumeRateLimit` existentes. **Não montado** em nenhum
Worker publicado — por isso o cliente só oferece a opção com
`--dart-define=IDENTIFIER_LOGIN=true`, em vez de a apresentar e falhar com 404.

11 testes Node novos (39 no total em `backend/`), executados e aprovados neste
ambiente. Não houve pedido real ao Supabase nem a nenhum Worker.


## Incremento 5 — avisos e resultados (17/10/2026)

`backend/records.ts`: `GET /api/mobile-v4/schools/:schoolId/notices?role=` e
`.../results?role=`, envelope `version: 1` com `schoolId`, `role`, `userId` e
`items`. Os serviços canónicos destas duas áreas não fazem parte desta
checkout, pelo que **este ficheiro é o contrato que o cliente lê, não um porte
provado do de produção**. Duas regras de domínio decidem a forma:

- A escala vem da escola. Nada presume 0–20; uma nota publicada sem `scaleMax`
  utilizável, sem valor, acima do máximo ou sem data é 503 `RESULTS_INVALID` —
  não se mostra um número que não se sabe ler.
- Uma nota só existe para quem lê depois de publicada. Um registo `pending`
  viaja sempre sem valor, sem escala e sem data, mesmo que o serviço os tenha.

Além disso: allowlist explícita (nenhum autor, destinatário, nota interna ou
userId de colegas), resposta fora do âmbito escola/papel é 503, falha de
leitura nunca vira lista vazia, `nextCursor` é declarado para o cliente poder
dizer que há mais em vez de apresentar um fim falso, e as guardas de sessão,
método, origem e query são as mesmas de `api.ts`.

9 testes Node novos (48 no total em `backend/`), executados e aprovados.
Não montado em nenhum Worker; o cliente só oferece as páginas com
`--dart-define=INSTITUTIONAL_RECORDS=true`.


## Incremento 5 — histórico de conversa (17/10/2026)

`backend/chat.ts`: `GET /api/mobile-v4/schools/:schoolId/chat/threads/:threadId?role=`.
Só leitura, por decisão: o envio, os anexos e o Realtime exigem endpoints de
escrita, políticas de Storage e capacidades instaladas por escola que não são
verificáveis a partir deste repositório — e o cliente não deve ganhar um botão
de envio sem servidor onde publicar.

Anexos viajam como nome e tamanho, **nunca como ligação**: um endereço para o
armazenamento da escola tem de ser assinado a cada pedido pelo servidor que é
dono da política. A allowlist não devolve userId, e-mail, telefone nem caminho
de Storage do autor. Conversa inexistente e conversa fora do âmbito dão a mesma
resposta (404). Resposta sobre outra conversa, escola ou papel é 503, falha de
leitura é 503 `HISTORY_UNAVAILABLE` e nunca uma conversa vazia, e
`previousCursor` é declarado em vez de perder mensagens em silêncio.

7 testes Node novos (55 no total em `backend/`), executados e aprovados.
Não montado; o cliente só abre o histórico com
`--dart-define=INSTITUTIONAL_CHAT=true`.
