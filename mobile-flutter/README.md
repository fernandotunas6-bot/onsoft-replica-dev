# SIGA Plus Flutter 2026

Base incremental para substituir o cliente Mobile V4 em m.portal-siga.com.
**Ainda não substitui a aplicação publicada.** Esta branch parte de
0249dab7, preserva o backend Mobile V4 e não executa migrações.

## Implementado

Flutter Material 3, GoRouter com separadores preservados, selector de vínculos
activos/perfil aluno ou professor; e-mail/senha e desafio TOTP do Supabase SGA;
consulta HTTP de sessão, disciplinas/turmas, horários, tarefas e lista de
conversas. Mudança de escola/conta invalida respostas pendentes. A API existente
continua a decidir autorização e MFA; o cliente não consulta tabelas académicas.
Estados de erro/carregamento/vazio, pesquisa, refresh e aparência claro/escuro.
Introdução 3,2 s ou 650 ms após a primeira abertura, salto, movimento reduzido,
e restauração de sessão em paralelo. Só a preferência de intro/movimento é
persistida pelo código; o SDK gere a sua própria sessão.

## Identidade: limite explícito

O painter é uma proposta tipográfica com expansão, recorte e dissolução.
**Não é o morph vectorial exacto pedido pelo utilizador.** A referência raster
não fornece o vector original; não foi criado nem inventado um ficheiro Rive.
Antes da aprovação visual, obter o SVG original do S, construir um artboard
Rive e validar a transformação contínua S → Seja bem-vindo → S.
O wordmark provisório também não substitui a arte final fornecida.

## Executar

Flutter 3.35.7 / Dart 3.9.2:

```
flutter pub get
flutter analyze
flutter test
flutter run -d chrome --dart-define=SUPABASE_URL=<url-do-SGA> --dart-define=SUPABASE_PUBLISHABLE_KEY=<chave-publica> --dart-define=HCAPTCHA_SITE_KEY=<chave-do-site>
```

`HCAPTCHA_SITE_KEY` é a chave pública par de `VITE_HCAPTCHA_SITE_KEY` no portal
e do segredo guardado no Supabase. O projecto tem `security_captcha_enabled`:
sem este sinal o `/auth/v1/token` recusa antes de olhar para a senha. Sem a
chave o login apresenta o aviso de configuração em falta em vez de acusar os
dados da pessoa.

As duas definições são públicas; nunca incluir service_role ou segredos de
servidor. A validação CI compila sem configurações de produção e mostra um
estado de configuração pendente. O artefacto CI não é uma release institucional.
O gateway usa a mesma origem no Web; apps Android/iOS ainda precisam de
configuração de origem HTTPS e política CORS explícita. Não estão empacotadas.
Commitar pubspec.lock após a primeira resolução aprovada, antes da release.

## Pendências de paridade antes de substituir o domínio

- Fonte Inter empacotada, iconografia equivalente, wordmark original e Rive.
- Login por ID/B.I., recuperação, OAuth, passkeys e migração da sessão React
  para Flutter (não ler tokens directamente de localStorage nem de URLs).
- Próxima aula pelo relógio de Luanda; horários por dia; avisos; calendário
  de presenças reais (um horário não prova presença); páginas de actividades.
- Detalhe de disciplina, tarefas/entregas, chat/histórico/anexos/Realtime,
  notas, propinas, recibos, documentos e funcionalidades docentes completas.
- Perfis encarregado/administrador requerem contratos próprios: a API actual
  apenas oferece aluno/professor. Não atribuir permissões artificiais.
- Lógica de aprendizagem inspirada no Moodle; nenhuma integração Moodle,
  duplicação de notas ou nova base de dados foi implementada.
- Persistência de aparência e estados de filtros; acessibilidade, teclado,
  zoom e motion contextual em menus/cartões/bottom sheets.
- Offline apenas quando houver política para dados sensíveis: sem cache
  académica/service worker neste incremento.

## Publicação reversível

O domínio é servido por mobile-v4/deployment/domain-worker.mjs; o seu
PAGES_ORIGIN aceita apenas previews do projecto siga-plus-mobile-v4. Não mudar
DNS nem eliminar o Worker. Primeiro compilar Flutter com configuração pública,
empacotar o backend/worker existente com os assets Flutter e publicar preview
isolado no mesmo projecto, mantendo bindings de servidor fora dos assets.
Validar MFA, vínculos e paridade com contas autorizadas; medir abertura, scroll,
teclado e acessibilidade em Android de entrada; só então apontar PAGES_ORIGIN
para a nova versão fixa. Registar a origem anterior e testar rollback.

## Validação desta entrega

SDK ausente no executor; download do SDK devolveu 404. Testes incluídos para
sessão ausente, resposta de outra escola, mudança de escola durante pedido,
403, salto e movimento reduzido. Execução/análise/build dependem do workflow
mobile-flutter.yml. Não declarar estes testes aprovados sem o resultado CI.

## Refinamento 2 — 13/10/2026

Dashboard com aula prevista em curso/próxima de hoje (horários publicados,
validade e UTC+1), três disciplinas e cinco actividades ordenadas por prazo.
Horários navegáveis por dia com Hoje, pesquisa e indicação de dados legados.
Ficha de disciplina em bottom sheet com docente e actividades publicadas.
Não deduz presenças nem cumprimento de tarefas. Catálogo incompleto/inválido
produz erro explícito em vez de listas vazias. Tema persistido, largura máxima
720 px, contexto reinicializado em nova verificação de sessão. Login valida
campos e remove senha do controller antes da chamada. Refresh trata falhas.
Gradiente da introdução dissolve com alpha aplicado às cores do shader.

Novos testes Dart cobrem mudança de dia em Luanda, validade, exclusão de
horários legados da próxima aula, referência a disciplina fora do catálogo e
catálogo incompleto. **Não executados:** Flutter/Dart continuam ausentes.
Verificação local de diff sem whitespace inválido; ZIP verificado sem erro.
Histórico/chat completo, avisos, notas/propinas e morph original seguem pendentes.
Nenhum push nem alteração de domínio nesta revisão.

## Expansão 3 — Turmas e tarefas

Páginas protegidas /more/classes, /more/classes/:id e /more/tasks. Turmas
agrupadas pelo classGroupId real; detalhe com disciplinas e horário de hoje.
Tarefas com pesquisa, instruções e prazo. Sem botões de envio fictícios nem
links WhatsApp/Zoom inventados. Matriz e plano em docs/AUDITORIA_E_PLANO.md,
com origem no código auditado e distinção entre código existente e operação
validada. Transporte, BBB e endpoints móveis das integrações continuam por
implementar. Build/testes Dart continuam sem execução neste ambiente.

## Backend — incremento 4

Detalhes em docs/BACKEND.md. API de turmas versionada e adaptador para o
catálogo existente montados no Worker de staging local; guardas de transporte
e integrações em backend/. 20 testes Node executados e aprovados. Não confundir
com Flutter/Worker compilados ou Supabase remoto validado. O ZIP inclui os dois
ficheiros de integração no repositório, além do cliente e backend isolado.


## Incremento 5 — captcha e recusas do Auth (17/10/2026)

**Validação executada neste ambiente**, pela primeira vez: SDK Flutter 3.35.7 /
Dart 3.9.2 instalado, `flutter pub get` (85 dependências), `dart format`,
`flutter analyze` sem problemas, `flutter test` com 19 testes aprovados,
`flutter build web --release --no-web-resources-cdn --pwa-strategy=none`
concluído e 28 testes Node em `backend/` aprovados. `pubspec.lock` fixado.

Corrigido um bloqueio real: o cliente chamava `signInWithPassword` sem
`captcha_token`. Com `security_captcha_enabled` activa no projecto Supabase, o
`/auth/v1/token` recusa antes de olhar para a senha e a interface mostrava
«verifique os seus dados» — a mesma confusão que o portal React documenta em
`AuthCaptcha.tsx`. Agora: desafio hCaptcha com render explícito na Web
(`lib/captcha_web.dart`), sinal de uso único com `reset()` após cada tentativa,
recusa do Auth traduzida por código em `lib/auth_errors.dart` com as mensagens
do `mapSignInError` do portal, e estado explícito quando falta a chave ou o
alvo não apresenta o desafio (Android/iOS precisam de WebView próprio, não
empacotado). Nenhum pedido segue sem sinal onde o desafio é apresentável.

**Não validado:** nenhuma entrada real foi feita contra o SGA de produção; o
desafio hCaptcha não foi exercido num browser com chave verdadeira. ID/B.I.,
recuperação, OAuth e passkeys continuam pendentes — dependem de contrato móvel
que não existe nesta cópia do repositório (ver abaixo).

## Incremento 5 — login por B.I., telefone ou e-mail

`lib/identity_login.dart` fala com `POST /api/mobile-v4/auth/identifier`
(contrato e garantias em docs/BACKEND.md) e instala a sessão pelo refresh
token devolvido, deixando a renovação ao SDK. O formulário ganha um selector
E-mail / B.I. ou telefone, valida o identificador antes de gastar o limite do
servidor e traduz `CAPTCHA_REQUIRED`, `INVALID_CREDENTIALS`, `RATE_LIMITED` e
`SERVICE_UNAVAILABLE` pelas mensagens do portal. Um 200 sem sessão utilizável
não é tratado como entrada.

A opção só aparece com `--dart-define=IDENTIFIER_LOGIN=true`: o endpoint não
está montado em nenhum Worker publicado, e oferecer um caminho que devolve 404
seria pior do que não o oferecer. Recuperação de senha, OAuth e passkeys
continuam pendentes.

28 testes Dart e 39 testes Node executados e aprovados neste ambiente; nenhuma
entrada real contra o SGA de produção foi feita.

## Limite do repositório: o servidor Mobile V4 não está aqui

O cliente consome `/api/mobile-v4/...`, mas `src/features/mobile-v4/` —
`session-core.server.ts`, `academic-catalog.server.ts`, `results.server.ts`,
`notifications.server.ts`, `chat.server.ts`, `http.server.ts` — não existe
nesta checkout nem em nenhum commit do histórico desta cópia, e o mesmo vale
para `mobile-v4/deployment/domain-worker.mjs` e para o worker de staging onde
`backend/api.ts` diz estar montado. Os contratos citados na auditoria não são
verificáveis a partir deste repositório. O que é verificável aqui, e foi lido:
`src/features/access/bi-login.ts` (resolvedor B.I. e `passwordGrant`),
`src/features/access/server.ts` (`signInWithIdentifierFn`, limites por IP e por
conta) e `src/components/auth/AuthCaptcha.tsx`. Páginas de notas, avisos e chat
completo exigem esses contratos: implementá-las aqui obrigaria a inventar
nomes de campos, e um catálogo inventado falha em silêncio contra a API real.
