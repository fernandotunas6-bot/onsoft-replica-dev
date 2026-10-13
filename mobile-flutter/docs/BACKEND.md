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

## Validação após remoção do React

Workflow Flutter passa a validar Node backend também em main e na branch
Flutter. Comandos preview/promote do publicador legado estão bloqueados;
check mantém verificações históricas e não comprova compatibilidade Flutter.
Worker packing depende de Flutter Web compilado e de dependências do backend.
Nenhuma publicação automática foi introduzida.

## Contratos migrados validados

Instalação Node isolada com package-lock.json e versões fixas.
TypeScript de backend, contratos e request-context aprovado. Vitest: 96 testes
em oito ficheiros aprovados, cobrindo catálogo, políticas, API, sessão,
calendário/chat, próximas aulas e isolamento de request-context. Backend Node:
28 testes já aprovados. Workflow passa a executar as três verificações.
Não equivale à build do Worker completo, Flutter ou ensaio Supabase remoto.

## Validação dos horários na projecção

Backend de turmas passa a rejeitar horário com ID repetido, dia fora de 1–7,
hora inválida, fim anterior ao início, publicação desconhecida e sala com tipo
ou tamanho inválido. Evita exportar objectos inesperados dentro de campos
de apresentação. TypeScript aprovado, 29 testes backend e 96 contratos
aprovados. Nenhuma validação remota ou build Flutter foi inferida destes testes.

## Fronteira Worker/API

Router testável separa assets Flutter, API canónica e extensão turmas/tarefas.
API desconhecida nunca cai no HTML. Origem externa é recusada antes do serviço;
respostas API recebem private/no-store, Vary e nosniff, sem Set-Cookie.
Excepções inesperadas devolvem 503 genérico. Worker staging usa este router
e mantém request-context isolado por chamada.

TypeScript de backend aprovado; 36 testes Node aprovados (7 novos de routing).
Não comprova bundle Cloudflare, bindings de produção ou integração Auth real.

## Worker compilado e verificado

Executado build-worker.mjs --validate-only com dependências do lockfile Bun.
Bundle completo gerado em build/worker-check, separado dos assets Flutter e
marcado VALIDATION_ONLY. check-worker.mjs importou o bundle e verificou:
sessão ausente 401, origem externa 403, API desconhecida 404/no-store e assets
encaminhados ao binding ASSETS controlado. 36 testes backend passaram.

A instalação terminou com 819 pacotes do lockfile, com scripts de instalação
desactivados; não equivale à build integral do portal. Não houve ensaio positivo
Auth/MFA, queries autorizadas, pagamentos ou providers. Flutter continua sem
build neste ambiente. O pacote de produção exige index.html e
flutter_bootstrap.js gerados pelo Flutter, além dos bindings configurados.

## Cliente Flutter: consultas institucionais

Rotas /more/notifications, /finance, /documents e /results ligadas aos endpoints
existentes via Bearer/session/contexto actual. Finance/documents/results apenas
aluno; validação de escola/papel e, quando o contrato contém, userId. Consulta
de avisos sem marcar leitura; facturas com recibos, sem saldo inferido ou checkout
local; pautas com média nula preservada; pedidos documentais sem escrita.

Novos testes Dart de âmbito financeiro preparados, não executados (SDK ausente).
Worker recompilado e smoke checks aprovados. Sem ensaio autenticado real, a
ligação de código não comprova conexão total operacional. CAPTCHA/Auth/MFA,
chat completo, escritas, providers e Flutter build permanecem pendentes.
