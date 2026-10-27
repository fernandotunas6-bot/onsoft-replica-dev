# App SIGA Plus (Android) — estado e plano para continuar

Ponto de entrada para qualquer agente que continue a app móvel. Ler também:
[MIGRACAO_SUPABASE.md](./MIGRACAO_SUPABASE.md) (modo SIGA, regras de acesso),
[PUBLICAR_ANDROID.md](./PUBLICAR_ANDROID.md) (assinatura e publicação) e
[IDENTIDADE_VISUAL.md](./IDENTIDADE_VISUAL.md).

## O que é

`estudo/yft-school-system` construído no **modo SIGA**: contas e dados reais do SIGA
(Supabase). Lê pelo Worker do estudo (`/api/sga/*`, em
`siga-yft.valentinocanguele.workers.dev`) e pelas rotas móveis do portal
(`src/routes/api/mobile/*`, que chamam as funções de servidor do SIGA). Descarrega-se
em portal-siga.com/download (release `android`, nunca a «latest»).

## Estado (27/10/2026) — versão 1.2.0 publicada; 1.3.0 a seguir

| Área | Estado | Onde |
| ---- | ------ | ---- |
| Entrada com e-mail, B.I. ou n.º de aluno (+ endereço da escola) | feito | `/api/mobile/login`; `lib/core/sga/sga_auth.dart` |
| Aluno com menu próprio (`AppSession.isStudent`) | feito | `lib/core/widgets/app_shell.dart` |
| Início «Hoje»: média, turma, próxima avaliação, próxima aula | feito | `/api/mobile/agenda`; `features/work/presentation/work_widgets.dart` |
| Trabalhos (Por fazer · Entregues · Com nota, detalhe) | feito | `/api/mobile/work` (`getMyWorkOverview`); `work_screen.dart` |
| Selector de educando (encarregado com vários) | feito | `focusWardProvider` em `lib/core/sga/sga_work.dart` |
| Esqueletos de carregamento | feito | `lib/core/widgets/skeleton.dart` |
| Boletim, faltas, horário, comunicados, recibos, mensagens | feito (#154) | `/api/sga/*` |
| Chamada e notas do professor | feito (#154) | `/api/mobile/attendance`, `/grades` |
| Funcionar sem rede (cópia das leituras + faixa «Sem rede · a ver dados de há N horas») | feito (#364) | `lib/core/offline/offline_cache.dart` |
| Centro de notificações (sino do Início, por dia, «Por ler», marcar lidas, destino por tipo) | feito | `/api/mobile/notifications`; `features/notifications/` |
| Tempo real com a app aberta (avisos, mensagens, comunicados) | feito | `lib/core/realtime/` (Supabase Realtime) |
| Notificações no telemóvel com a app fechada (verificação de 30 em 30 min) | feito | `lib/core/notify/` (WorkManager + notificações locais) |
| Lembretes da véspera (avaliações e trabalhos para amanhã) | feito | `planTomorrow` em `notify_planner.dart` |
| «Para ter em atenção» no Início (alertas por prioridade) | feito | `features/dashboard/presentation/widgets/home_alerts.dart` |
| Faltas por disciplina (percentagem, limite da escola, quantas ainda cabem) | feito (1.3.0) | `/api/mobile/absences` (`getMyAbsencesBySubject`); `subject_absences_section.dart` |
| Notificações instantâneas com a app fechada (FCM) | à espera do dono | ver «Pendências do dono» |
| Entregar trabalhos na app | por fazer | hoje no portal (`submitTaskWork`) |

## Plano, por ordem (decidido com o dono a 27/10)

1. ~~**Funcionar sem rede.**~~ Feito: `OfflineCacheInterceptor` nas duas ligações do
   modo SIGA (Worker e portal). Guarda cada GET com sucesso, por conta e escola, na
   pasta privada da app (em memória na versão web); só usa a cópia quando não há
   resposta do servidor (um 401/403/500 nunca é escondido); escritas nunca. A faixa
   `OfflineBanner` no `AppShell` mostra de quando são os dados. Apaga-se quando a
   sessão acaba (`SgaSession.onClear`). Teste: `test/offline_cache_test.dart`.
2. ~~**Faltas por disciplina.**~~ Feito (1.3.0): `getMyAbsencesBySubject` no portal
   (aluno ou educando, por `resolveVisibleStudent`), sobre a chamada do SIGA do ano da
   matrícula activa, sem aulas canceladas; justificadas e sem registo não contam (a
   regra de `absencePercentageFromStatuses`). Limite = `maximum_absence_percentage` do
   modelo `DEFAULT` em vigor; «quantas ainda cabem» conta sobre as aulas dadas até hoje.
   Aviso a partir de 75 % do limite. Na app: secção «Por disciplina» no ecrã Faltas e
   alertas no Início.
3. ~~**Notificações**~~ Feito (27/10), em camadas, sem depender do Firebase:
   - **Fonte:** a tabela `notifications` do SIGA (o sino do portal), pela rota
     `/api/mobile/notifications`; `?pulse=1&after=&announcements_after=` devolve num só
     pedido pequeno só o que é novo, as mensagens por ler e os comunicados novos.
   - **App aberta:** `SgaRealtime` (pacote `realtime_client`, só Dart) com três canais:
     `notifications` (filtro `user_id`), `siga_chat_messages` e `school_announcements`.
     O RLS do servidor filtra. Sem tempo real dos avisos (ver pendências), verifica-os
     de minuto a minuto (`LiveUpdates`). Novidade → faixa «Ver» no ecrã.
   - **App fechada (Android):** `workmanager` de 30 em 30 min, com rede, fora das 22h–6h;
     `NotifyChecker` + `planFromPulse` decidem o que mostrar (nunca repete, junta quando
     são muitos, mensagens sem o texto). Estado em `notify_state.json` (partilhado com a
     app). A sessão renova-se em segurança entre os dois isolates (`SgaSession._renew`).
   - **Definições:** `/notifications-settings` com interruptores reais (telemóvel,
     lembretes da véspera) e o pedido de autorização do Android 13+.
4. **Capturas dos ecrãs no CI** (testes «golden» com dados falsos, artefacto no PR),
   para rever o visual sem telemóvel.
5. **Retoque visual** no estilo Material 3 Expressive (formas, movimento com mola,
   tipografia), sem pesar em telemóveis de gama baixa.
6. Entregar trabalhos na app (foto/PDF), quando 1–5 estiverem feitos.

Princípios da pesquisa (apps escolares 2025–26): «agora e a seguir» no Início; prazos
e estado visíveis; rede lenta é a regra em Angola (cache, imagens leves, poucas
animações); ícones Lucide (o pacote Phosphor tem problemas com o SDK da app).

## Como trabalhar nela

- **O Mac do dono (macOS 12) não corre o Flutter**, mas uma sessão na nuvem corre:
  descarregar `flutter_linux_3.41.5-stable.tar.xz` de
  `storage.googleapis.com/flutter_infra_release/releases/stable/linux/` para a pasta
  temporária e correr `flutter analyze` e `flutter test` antes de abrir o PR. O CI
  continua a ser a prova final. Um PR que mexa em
  `lib/`, `android/` ou `pubspec` corre o workflow «Estudo — YFT (APK Android)»:
  `flutter analyze` (falha até com sugestões de `const`), `flutter test`, build e
  confirmação da assinatura. Os testes do Worker correm no «Estudo — YFT School System
  (build)», à mão.
- **Flutter 3.41.5** (com 3.47 o `lucide_icons` 0.257 não compila). Antes de usar um
  ícone, confirmar que existe nessa versão do pacote.
- **Rotas novas no portal:** `src/routes/api/mobile/<nome>.tsx` com `mobileRespond`,
  teste em `tests/api/`, e regenerar `src/routeTree.gen.ts` **mantendo o bloco
  `declare module '@tanstack/react-start'` no fim** (o `tsr generate` apaga-o; a
  publicação parou por isso a 26/10).
- **Publicar:** fundir o PR, esperar a publicação do portal (as rotas novas têm de
  estar no ar), depois Actions → «Estudo — YFT (APK Android)» com `versao` maior e
  `publicar` = sim; e «Estudo — Worker no modo SIGA (teste)» para a versão web.
- Falha «Archive is not a ZIP archive» no NDK do Android: é do GitHub; repetir o job.
- O pacote é `ao.onsoft.sigaplus` e a chave de assinatura é fixa: nunca mudar.

## Pendências do dono

- **Tempo real dos avisos pessoais:** colar `docs/agents/SIGA_aplicar_tempo_real_avisos.sql`
  no SQL Editor do Supabase (publica `notifications` no tempo real; não alarga acessos).
  Até lá a app verifica-os de minuto a minuto com a app aberta.
- **Notificações instantâneas com a app fechada (FCM):** registar a app Android
  `ao.onsoft.sigaplus` no Firebase `siga-plus-integracoes`, pôr o `google-services.json`
  na variável `YFT_GOOGLE_SERVICES_JSON` e criar uma conta de serviço com permissão de
  envio (FCM HTTP v1) para o servidor. Depois: tabela de dispositivos só do servidor,
  rota para registar o token e envio a cada `notifications` novo.

- Trocar a chave `sb_secret_…` do Supabase (colada numa conversa a 26/10, não usada).
- Guardar `~/.tauri/` e `~/.android-siga/` no cofre de senhas.
- Testar a app num telemóvel com uma conta real (aluno, encarregado, professor).
