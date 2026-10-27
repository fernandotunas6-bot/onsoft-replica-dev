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

## Estado (27/10/2026) — versão 1.1.0

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
| Funcionar sem rede (cópia das leituras + faixa «Sem rede · a ver dados de há N horas») | feito (por publicar) | `lib/core/offline/offline_cache.dart` |
| Entregar trabalhos na app | por fazer | hoje no portal (`submitTaskWork`) |

## Plano, por ordem (decidido com o dono a 27/10)

1. ~~**Funcionar sem rede.**~~ Feito: `OfflineCacheInterceptor` nas duas ligações do
   modo SIGA (Worker e portal). Guarda cada GET com sucesso, por conta e escola, na
   pasta privada da app (em memória na versão web); só usa a cópia quando não há
   resposta do servidor (um 401/403/500 nunca é escondido); escritas nunca. A faixa
   `OfflineBanner` no `AppShell` mostra de quando são os dados. Apaga-se quando a
   sessão acaba (`SgaSession.onClear`). Teste: `test/offline_cache_test.dart`.
2. **Faltas por disciplina:** percentagem e quantas faltam até ao limite
   (`maximum_absence_percentage` do modelo de avaliação do SIGA).
3. **Notificações** de comunicados, notas e prazos de trabalhos (exige decidir o
   canal: FCM, que traz o Firebase de volta, ou outro).
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

- Trocar a chave `sb_secret_…` do Supabase (colada numa conversa a 26/10, não usada).
- Guardar `~/.tauri/` e `~/.android-siga/` no cofre de senhas.
- Testar a app num telemóvel com uma conta real (aluno, encarregado, professor).
