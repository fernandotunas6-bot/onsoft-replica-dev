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

## Incremento de notas e avisos — 13/10/2026

GET /api/mobile-v4/schools/:schoolId/results?role=aluno
GET /api/mobile-v4/schools/:schoolId/notices?role=aluno|professor[&cursor=…]

Reutilizam a mesma validação de sessão, origem, escola e perfil, e o catálogo
autorizado continua a decidir quais disciplinas podem aparecer. As notas são
servidas apenas ao perfil aluno e apenas ao próprio: `studentId` tem de ser o
utilizador autenticado, e qualquer registo fora disso devolve 503. O perfil
professor recebe 403 RESULTS_PROFILE_UNSUPPORTED — as notas de uma turma
dependem de uma avaliação de privacidade por perfil que não está feita.

Só entram avaliações com `publication: 'published'`. A escala vem da escola
(`scaleMax`, 0 < escala <= 100); nota fora da escala, trimestre duplicado,
código de nota repetido ou disciplina fora do catálogo falham fechado (503).
O servidor não calcula médias nem arredonda: devolve o que a escola publicou.
A projecção leva classSubjectId, subjectName (do catálogo), termId, termName,
publication, scaleMax, grades[code,label,value], finalGrade e status — sem
studentId, comentários de docente ou campos futuros.

Os avisos respeitam a audiência decidida no servidor: `school` não pode trazer
classSubjectId e `class`/`subject` têm de apontar para disciplina autorizada.
Aviso agendado (publishedAt acima do relógio injectado, com 60 s de tolerância),
id duplicado, carimbo sem timezone ou página acima de 100 itens falham com 503.
O cursor é opaco: validado por `[A-Za-z0-9_-]{1,128}`, nunca interpretado aqui,
e um `nextCursor` igual ao pedido é recusado para não criar ciclo de paginação.
`cursor` só é aceite em notices; qualquer outro campo de query continua 422.
Sem endpoint montado (dependência ausente) devolve 503, nunca lista vazia.

39 testes Node aprovados (`node --experimental-strip-types --test
mobile-flutter/backend/*.test.mjs`). Os 11 novos cobrem projecção, perfil
professor, notas de terceiros, rascunhos, escala, duplicações, audiência,
agendamento, cursor inválido/repetido, ids de recurso e serviço não montado.
Continuam a faltar: adaptador na main, build completa do Worker e ensaio remoto
com duas escolas reais. Nenhum endpoint está montado nem publicado.

## Validação Flutter executada — 13/10/2026

Com Flutter 3.35.7 / Dart 3.9.2 instalados no executor desta sessão:
`flutter pub get` (pubspec.lock fixado), `dart format lib test` (sem alterações
após a formatação versionada), `flutter analyze` (18 avisos informativos, os
mesmos da base — o incremento não acrescenta avisos) e `flutter test`
(23 testes aprovados). A build web release corre no workflow e foi executada
localmente. Isto valida compilação e lógica local; não valida sessão real,
CAPTCHA, RLS, nem dados de produção.
