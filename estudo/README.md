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
| `flutter test` | 10 testes, passam |
| `flutter build web` | compila com 3.41.5; **falha com 3.47** (`lucide_icons` estende `IconData`, que passou a `final`) |
| Worker `vitest` | 9 testes, passam |
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

## Defeito corrigido: moeda da escola (15/10/2026)

A moeda, o ano e o trimestre da escola só eram carregados quando o
administrador abria o calendário académico. Até lá, todos os ecrãs mostravam
GH₵, mesmo numa escola em Kz. A lista de moedas também não tinha o kwanza, e
uma moeda fora da lista deixava o campo vazio. Agora:

- a configuração carrega-se logo após o login (`academic_year_state.dart`);
- a lista inclui o Kwanza e a moeda gravada pela escola;
- o GH₵ fixo no código desapareceu.

O teste `test/academic_year_test.dart` falha com o código antigo e passa com
o novo. Não há modo de demonstração nem dados fictícios: os ecrãs só mostram
dados vindos da API da escola.

## Valores em kwanzas no formato angolano (15/10/2026)

Os valores eram escritos como `Kz 12500.00`, sem separador de milhares, e
cada ecrã formatava à sua maneira (o painel inicial nem mostrava cêntimos).
Agora todos passam por `formatMoneyDisplay` (`lib/core/utils/currency_display.dart`):

- kwanza: `12 500,00 Kz`, como no SIGA Flutter (espaço inseparável nos
  milhares, vírgula decimal, símbolo no fim);
- outras moedas: `GH₵ 12,500.00`;
- no PDF, o mesmo formato com espaço normal, porque as fontes base do PDF não
  têm o espaço inseparável.

Os campos onde o utilizador escreve o valor continuam com o número simples.
O teste `test/currency_display_test.dart` cobre os milhares, os negativos, o
arredondamento ao cêntimo e o PDF.

## Dados inventados e botões falsos no código original (15/10/2026)

Corrigido:

- `receipt_preview_screen.dart` tinha «YFT School System», «Accra, Ghana» e a
  turma «Basic 4A» escritos no código. O ecrã não era usado e foi apagado.
- «Dados pessoais» vinha preenchido com «John Doe», «johndoe@email.com»,
  «+233 55 123 4567» e «Tema, Community 2». O botão «Save» dizia que tinha
  guardado, mas não guardava nada. Agora mostra os dados reais da conta
  (`GET /api/users/me`) e é só de leitura.
- Quatro botões diziam «guardado» sem chamar o servidor: publicar aviso,
  guardar presenças, preferências de notificação e mudar a senha. O
  interruptor de dois factores também não fazia nada. O Worker não tem
  rotas para nenhum destes, por isso ficam desactivados com «ainda não
  disponível».

## Senha partilhada por escola (15/10/2026)

Cada escola tem uma única senha para todos os professores e encarregados
criados na app. Por omissão, essa senha era `Welcome@123`, no Worker e no
formulário do super-admin. Quem não tem e-mail entra com um endereço gerado a
partir do telefone, fácil de adivinhar.

Corrigido:

- O Worker já não usa `Welcome@123`: sem senha da escola, gera uma aleatória,
  como já fazia para os encarregados.
- O onboarding exige uma senha escolhida para a escola, com pelo menos 10
  caracteres e sem valor por omissão. O formulário do super-admin deixou de a
  preencher.
- Teste no Worker (`test/security.spec.ts`), 7/7. Falha com o código antigo,
  em que a escola sem senha passava a validação.

**Senha temporária por pessoa (resolvido a seguir):**

- **Worker:** cada professor e cada encarregado novo recebe uma senha
  própria (`createHandoutPassword`: 12 caracteres sem 0/O/1/l/I, cerca de
  69 bits). A senha é devolvida uma só vez, em `temporary_password` ou
  `parent_temporary_password`. A senha comum da escola deixou de ser
  usada; no onboarding ficou opcional e, sem ela, guarda-se um valor
  aleatório (a coluna é NOT NULL).
- **App:** depois do registo ou da matrícula, mostra o acesso (e-mail e senha)
  numa janela que só fecha com «Já anotei».
- **App:** «Mudar senha» passou a funcionar pelo Firebase. Confirma a senha
  actual (reautenticação) e exige pelo menos 8 caracteres e uma senha
  diferente da actual.
- **Super-admin:** o campo da senha comum saiu dos dois formulários.
- **Testes:** app 10/10, Worker 9/9.
- **Falta:** obrigar a trocar a senha no primeiro acesso. Hoje a troca
  depende de a pessoa a fazer.

## Tradução para português (15/10/2026)

Os textos da app passaram para português, com os termos do SIGA: turma,
disciplina, aluno, encarregado, educando, propina, dívida, aviso, presenças e
notas. O nome «Edu Manager» ficou, porque mudar a marca é uma decisão de
produto. Captura: `yft-estudo-capturas/entrada-pt.jpg`.

- Os valores que a API grava ou compara continuam iguais (`Term 1`, `Male`,
  `Female`, `Other`). Passam a ser mostrados através de `lib/core/utils/labels.dart`:
  «1.º Trimestre» (ou «1.º Semestre» num ano de dois períodos), «Masculino».
- Os meses do recibo passaram a português.
- Texto inventado retirado:
  - «Ajuda»: prometia suporte 24/7, pagamentos «até 24 horas» e um portal de
    mensagens que não existe;
  - «Privacidade»: tinha uma política com data e um e-mail inventados. Agora
    diz a verdade: a escola trata os dados e a app ainda não tem política
    própria;
  - o botão «Contactar» da ajuda não fazia nada e ficou desactivado.
- O teste do autor (`test/widget_test.dart`) foi actualizado para o novo
  subtítulo do arranque; os 7 testes passam e o `flutter analyze` não dá
  avisos.

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
