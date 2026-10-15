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
| `flutter test` | 3 testes, passam |
| `flutter build web` | compila com 3.41.5; **falha com 3.47** (`lucide_icons` estende `IconData`, que passou a `final`) |
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

## Demonstração com dados (15/10/2026)

`lib/main_demo.dart` abre os ecrãs reais com dados fictícios de uma escola
angolana, em kwanzas, sem Firebase nem API (`lib/demo/demo_api.dart`
responde aos pedidos do Dio). Para entrar, usa-se qualquer senha com um
destes e-mails:

- `admin@demo.ao`
- `professor@demo.ao`
- `encarregado@demo.ao`

```sh
flutter run -d chrome -t lib/main_demo.dart
```

Capturas dos três perfis: `yft-estudo-capturas/demo-com-dados.jpg`.

**Defeito encontrado e corrigido com a demonstração:** a moeda, o ano e o
trimestre da escola só eram carregados quando o administrador abria o
calendário académico. Até lá, todos os ecrãs mostravam GH₵, mesmo numa escola
em Kz. A lista de moedas também não tinha o kwanza, e uma moeda fora da lista
deixava o campo vazio. Agora:

- a configuração carrega-se logo após o login (`academic_year_state.dart`);
- a lista inclui o Kwanza e a moeda gravada pela escola;
- o GH₵ fixo no código desapareceu.

O teste `test/academic_year_test.dart` falha com o código antigo e passa com
o novo.

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
- Ainda por resolver: os textos estão escritos à mão em inglês, sem i18n, e a
  moeda é a do Gana.
