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

`IdentityIntro` (`lib/identity.dart`) faz a transformação contínua em widgets
Flutter: «Seja» começa pelo mesmo «S», que nunca sai do lugar; o resto da
mensagem abre e fecha a partir dele (`MorphingMark`, `reveal` 0→1→0) enquanto
o mosaico estica até cápsula e volta; depois a marca encaixa por baixo.
Primeira abertura 3,3 s, seguintes 1,2 s, «Saltar», e nada com movimento
reduzido (do sistema ou da app). Os tempos estão em `IntroTimeline` e testados.
**Ainda não usa o vector original do S nem Rive:** o «S» é tipográfico (fonte
do sistema) sobre o gradiente da marca. Com o SVG original, trocar o «S» do
`MorphingMark` pelo vector, ou construir o artboard Rive com a mesma linha
temporal. O wordmark também é provisório.

## Design system e ecrãs (front-end)

- `lib/design/tokens.dart`: branco, preto suave, cinzento secundário, azul
  institucional configurável (Aparência → Cor principal), espaçamento de 8,
  cantos 12/16/24, gradiente só na identidade; claro e escuro.
- `lib/design/widgets.dart`: cartões com borda fina e resposta ao toque,
  mosaicos de serviço, etiquetas de estado, estados vazios, avatar por
  iniciais (nenhuma fotografia inventada), painéis inferiores com
  escurecimento discreto (sem desfoque).
- `lib/design/floating_nav.dart`: barra inferior flutuante com indicador que
  desliza; respeita movimento reduzido.
- Ecrãs: login, selector de escola, início (próxima aula, serviços escolares,
  disciplinas, próximas actividades), disciplinas com filtro por turma,
  calendário com faixa semanal, mensagens com «Não lidas», turmas, espaço da
  turma (estilo Moodle), tarefas por prazo, Mais, Aparência e Transporte.
- Honestidade: WhatsApp da turma, aulas online, presenças/notas da turma e o
  trajecto do transporte aparecem como «Por activar» ou «Simulação», com a
  explicação; nenhum botão simula uma integração que não existe.
- `test/ui_test.dart`: linha temporal da abertura, barra inferior, ecrãs com
  um gateway simulado, selector, aparência e transporte.

## Instalar no Android (APK)

O workflow «SIGA Flutter — validate migration» gera, no job `android`, o
artefacto **siga-plus-android-apk** com dois ficheiros:

- `siga-plus-demonstracao.apk` — os ecrãs reais com dados fictícios locais
  (`lib/main_demo.dart`); não pede senha nem contacta servidores; faixa
  «Demonstração · dados fictícios» sempre visível.
- `siga-plus.apk` — a app institucional: Supabase do SGA e API móvel em
  `https://m.portal-siga.com`. O job copia `.env.example` para `.env`, aplica
  as variáveis do repositório que existirem (`SIGA_SUPABASE_URL`,
  `SIGA_SUPABASE_PUBLISHABLE_KEY`, `SIGA_API_ORIGIN`, `SIGA_GOOGLE_LOGIN`,
  `SIGA_MICROSOFT_LOGIN`, `SIGA_APPLE_LOGIN`, `SIGA_AUTH_REDIRECT`), valida com
  `scripts/check-env.mjs` e compila com `--dart-define-from-file=.env`.

Para instalar: GitHub → Actions → a execução mais recente → Artifacts →
descarregar o ZIP, abrir o APK no telemóvel e permitir «instalar apps de origem
desconhecida». Os APK vão assinados com a chave de depuração: servem para
testar, não para a Play Store (falta a keystore da plataforma).

Localmente, com o Android SDK:

```
cp .env.example .env            # e ajustar
node scripts/check-env.mjs .env # recusa segredos
flutter build apk --release --dart-define-from-file=.env
```

## Âmbito da app

A app é para a rotina de alunos e professores (aula do dia, chamada, tarefas,
horário, faltas, mensagens, avisos e consultas). Trabalho complexo — lançar e
alterar notas, editar planos, criar tarefas, corrigir chamadas fechadas,
pedidos de documentos e pagamentos — faz-se no portal SIGA Plus web
(`SIGA_PORTAL_URL`) ou no aplicativo desktop; a secção «No portal SIGA Plus»
dos Serviços explica cada caso e abre o portal.

## Configuração (.env)

O `.env` (fora do Git) só leva valores públicos, porque fica legível dentro do
APK: URL e chave `sb_publishable_` do Supabase, origem da API, o endereço do
portal web (`SIGA_PORTAL_URL`) e os interruptores de login social. A senha da base de dados, a chave
`service_role`/`sb_secret_` e a senha do Gmail/SMTP ficam só no servidor
(segredos do Supabase e do Cloudflare); `check-env.mjs` recusa-as.

Entrar com Google (Gmail): no Supabase → Authentication → Providers activar
Google com o Client ID/Secret do Google Cloud, acrescentar
`ao.portalsiga.sigaplus://login-callback` (e o domínio web) às Redirect URLs e
pôr `SIGA_GOOGLE_LOGIN=true`. O mesmo para Microsoft (Azure) e Apple. A
recuperação de senha usa o e-mail do Supabase Auth (SMTP configurado lá).

## Executar

Flutter 3.35.7 / Dart 3.9.2:

```
flutter pub get
flutter analyze
flutter test
flutter run -d chrome --dart-define-from-file=.env
```

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

## Substituição do antigo frontend

A pasta mobile-v4 e o workflow React foram removidos nesta branch. Contratos
e serviços partilhados ficam em contracts/, Worker em staging/ e recursos
de domínio em deployment/. APIs /api/mobile-v4 preservadas por compatibilidade.
Após flutter build web, executar node scripts/build-worker.mjs a partir de
mobile-flutter. O empacotador exige index.html gerado. Não foi executado: SDK e
dependências do Worker ausentes. Nenhuma troca do site publicado foi feita.
Documentos em docs/mobile-v4-history são históricos, não instruções de build.
