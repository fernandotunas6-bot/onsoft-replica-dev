# Estudo — YFT School System

`yft-school-system/` é uma cópia, sem alterações, de
<https://github.com/Bosiakoba/YFT-SCHOOL-MANAGEMENT-SYSTEM> (commit `a347d85`,
12/04/2026), sem o histórico Git. Serve só para estudar.

## Licença: ler antes de usar qualquer coisa

O ficheiro `LICENSE` manda: **Business Source License 1.1**. O emblema «MIT» do
README do autor está errado. A licença permite estudar e modificar, mas a
*Additional Use Grant* **proíbe oferecer o software como serviço a sistemas de
gestão escolar concorrentes**. O SIGA é um sistema de gestão escolar.

**Actualização 14/10/2026:** o utilizador declarou ter autorização do autor
para usar o YFT no SIGA e pediu a publicação em `m.portal-siga.com`. A
publicação, com Firebase `siga-plus-integracoes` e reversão, está em
`yft-school-system/PUBLICAR_SIGA.md`. A autorização escrita deve ser guardada
fora do repositório. Até lá, valem as regras abaixo.

Regras para nós:

- Podemos ler, compilar e tirar ideias de arquitectura e de interface.
- Não copiamos código, ecrãs, SQL nem assets daqui para o SIGA (`src/`,
  `painel/`, `mobile-flutter/`). O que aprendermos, reescrevemos de raiz.
- A pasta está fora do eslint e do prettier da raiz, e nenhum build do SIGA a
  usa. Não fundir esta pasta na `main`: a `main` sincroniza com o Lovable.
- Os ficheiros de instruções do autor (`school-worker/AGENTS.md`, `.qwen/`)
  não se aplicam ao SIGA.

## O que é

| Parte | Pasta | Tecnologia |
| --- | --- | --- |
| App (admin, professor, encarregado) | `lib/` (89 ficheiros, ~15 300 linhas) | Flutter 3.41, Riverpod, GoRouter, Dio, Firebase Auth |
| API | `school-worker/` (~3 000 linhas) | Cloudflare Worker, Hono, Zod, jose, D1 (SQLite), R2 |
| Super-admin | `super-admin/` | Next.js 16, React 19, Tailwind |

Multi-escola numa só base D1: cada linha tem `school_id`. O middleware
verifica o JWT do Firebase com JWKS, resolve o utilizador e a escola e
bloqueia escolas suspensas (403 `school_suspended`). Há 11 migrações SQL.
O super-admin fala com o Worker com uma chave partilhada
(`X-Super-Admin-Key`).

## Build (verificado em 14/10/2026)

| Passo | Resultado |
| --- | --- |
| `flutter analyze` (Flutter 3.41.5) | sem avisos |
| `flutter test` | 1 teste, passa |
| `flutter build web` | compila com 3.41.5 e, desde 18/10/2026, também com 3.47.7 |
| Worker `vitest` | 6 testes, passam |
| Worker `wrangler deploy --dry-run` | empacota |
| Worker `tsc --noEmit` | sem erros (o erro de `classes.ts:23` foi corrigido) |
| Super-admin `next build` | compila (15 rotas) |

No GitHub: Actions → «Estudo — YFT School System (build)» → Run workflow.
Corre os mesmos passos e deixa o build web como artefacto.

Localmente:

```sh
cd estudo/yft-school-system
flutter pub get && flutter build web --dart-define=API_BASE_URL=http://127.0.0.1:9
cd school-worker && npm ci && npx wrangler dev   # precisa de D1 local e segredos
```

## Interface

`yft-estudo-capturas/ecras-sem-dados.jpg`: 20 rotas a 390×844, sem sessão e
sem API, por isso as listas aparecem vazias ou a carregar. Para o Firebase não
bloquear o arranque, este build local ignorou a falha de inicialização. Essa
alteração não está na cópia.

- Visual: verde-lima `#C7FF00` com preto, fundo `#F8F9FA`, ícones Lucide,
  cartões grandes no painel inicial, barra inferior com Home, Staff, Results
  e Profile.
- Ecrãs: login, recuperar senha, painel com resumo (alunos, turmas, dívidas),
  professores, admissão de alunos com encarregado, turmas, disciplinas,
  propinas e dívidas, registar pagamento, recibo em PDF, calendário
  académico, avisos, lançar notas, presenças, perfil, educandos e recibos.

## Pontos a reter (ideias, não código)

1. **Suspensão da escola** tratada no servidor e no cliente: o Worker
   devolve `403 school_suspended` e a app mostra um ecrã bloqueante.
2. **Permissão por escola para o professor lançar notas**
   (`teacherCanEditResults`), com aviso «só leitura» no ecrã.
3. **Recibo de propina em PDF** gerado no cliente (`pdf`, `share_plus`).
4. **Admissão com encarregado** «existente / novo» no mesmo formulário.

## Fragilidades notadas e corrigidas (14/10/2026)

- O router não tinha guarda: qualquer rota abria sem sessão. **Corrigido**:
  sem utilizador Firebase, só `/`, `/login` e `/forgot-password` abrem; o resto
  vai ao login (`lib/core/routing/app_router.dart`).
- A chave do super-admin era comparada com `!==`. **Corrigido**: a comparação
  é feita em tempo constante sobre os resumos SHA-256
  (`school-worker/src/lib/auth-guards.ts`).
- O CORS aceitava qualquer `*.vercel.app` e `*.workers.dev`. **Corrigido**:
  aceita só localhost e as origens da variável `ALLOWED_ORIGINS`. A app é
  servida na mesma origem e o super-admin chama a API pelo servidor.
- O `tsc` dava um erro (`classes.ts:23`, `c: any`). **Corrigido**, com tipos.
- Testes novos em `school-worker/test/security.spec.ts`: o Worker passa de 2
  para 6 testes, todos aprovados.
- Os textos estão escritos à mão, sem i18n. Em 18/10/2026 passaram a português
  e a moeda passou a kwanza (ver abaixo); a falta de i18n mantém-se — trocar de
  idioma obriga a mexer no código.

## SDK destravado (18/10/2026)

O projecto já não está preso ao Flutter 3.41.x. O pacote `lucide_icons` declara
os ícones através de `LucideIconData extends IconData`, e o Flutter 3.47 tornou
`IconData` uma classe `final`: a subclasse deixou de compilar. Os 80 ícones que
a app usa passaram a estar em `lib/core/theme/lucide_icons.dart` como `IconData`
simples, com os mesmos pontos de código e a mesma família de fonte. O pacote
continua na `pubspec.yaml` — a fonte vem dele —, mas nenhuma biblioteca Dart
dele é importada, e por isso a classe `final` já não afecta o build.

Verificado aqui, não presumido: `flutter analyze` sem avisos, 1 teste a passar
e `flutter build web` concluído **nas duas versões**, 3.41.5 e 3.47.7
(Dart 3.13.5). O `pubspec.lock` commitado continua a ser o resolvido pelo
3.41.5; o 3.47 resolve-o de novo quando corre `pub get`, e o 3.47 também
acrescenta exclusões ao `analysis_options.yaml` — nenhuma dessas alterações
automáticas foi commitada.


## Português e kwanza (18/10/2026)

A app e o Worker falavam inglês e cobravam em cedis do Gana. Agora:

- **Interface**: 337 literais traduzidos para português europeu em 41 ficheiros,
  incluindo as mensagens de erro do Firebase Auth, os ecrãs de propinas, notas,
  presenças, perfil, segurança e notificações, e as etiquetas do recibo em PDF.
- **Moeda**: por omissão `Kz`, com dólar e euro à escolha no calendário
  académico. O código ISO de reserva para o PDF passou de `GHS` a `AOA`. `Kz` é
  ASCII, por isso não quebra as fontes do PDF — era por isso que existia a
  conversão para código ISO.
- **Períodos**: `Term 1/2/3` passou a `I/II/III Trimestre`. **Atenção:** isto é
  um valor guardado, não só uma etiqueta — vai para `Grades.term` e
  `Receipts.fee_term` no D1. Numa base nova (o caso do SIGA) não há problema;
  numa escola com dados antigos, as notas e os recibos anteriores ficam presos
  ao nome antigo e precisam de migração.
- **Worker**: as 52 mensagens de erro da API, o título e o corpo do aviso de
  pagamento que o encarregado lê, e a descrição «Propina da turma» passaram a
  português. A moeda de reserva do Worker passou de `GHS` a `Kz`.
- **Datas**: os meses abreviados passaram a português. Corrigido de passagem um
  erro real: `getCurrentAcademicYear()` devolvia sempre `ano/ano+1` sem olhar ao
  mês, pelo que em Março de 2026 dizia «2026/2027» — um ano lectivo que ainda não
  tinha começado. A viragem passou a ser em Setembro.

Verificado aqui: `flutter analyze` sem avisos, 1 teste a passar (o do splash foi
actualizado para o texto novo), `flutter build web` concluído, e no Worker
`tsc --noEmit` sem erros com os 6 testes `vitest` a passar.

**Decisões que ficam para o utilizador**, e que não foram inventadas:

1. **Ano lectivo angolano.** Em Angola o ano lectivo começa em Fevereiro e cabe
   num só ano civil; o código mantém a convenção `2025/2026` com viragem em
   Setembro, que é a dos dados do autor. Se as escolas usarem a convenção
   angolana, é uma mudança de formato a decidir antes de haver dados.
2. **Aviso de privacidade.** O texto foi traduzido, mas é o texto genérico do
   autor, com o nome «Edu Manager» e sem responsável pelo tratamento nem base
   legal. Antes de produção tem de ser substituído pelo aviso da própria escola
   e revisto por quem responde por ele juridicamente. Ficou um comentário no
   código a dizê-lo.
3. **Marca.** `Edu Manager` continua como nome de reserva em três ecrãs (splash,
   login e painel, quando a API não devolve o nome da escola), e o recibo não
   usado mostra «YFT School System». Mudar a marca é decisão do utilizador.
4. **Ecrã morto.** `receipt_preview_screen.dart` não é instanciado em nenhum
   sítio e mostra dados inventados num recibo («Accra, Ghana», turma «Basic
   4A»). Os valores do Gana foram retirados, mas o ecrã devia ser apagado: um
   recibo com dados inventados é uma armadilha. O caminho vivo é
   `fee_receipt_view_screen` com `FeeReceiptTemplate` e `buildFeeReceiptPdf`.
