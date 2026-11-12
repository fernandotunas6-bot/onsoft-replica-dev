# Correspondência YFT ↔ SIGA Plus

Levantamento para a opção **B**: os alunos do YFT são os alunos do SIGA e as
escolas são as mesmas escolas. Escrito a 14/10/2026 a partir das 11 migrações
de `estudo/yft-school-system/school-worker/migrations/` e de
`supabase/PRODUCTION_SNAPSHOT.json` (189 tabelas, 359 políticas, capturado a
06/10). Não propõe código: serve para decidir com números à frente.

## O resumo, antes do detalhe

O YFT tem **11 tabelas**. O SIGA tem **189**. Nenhuma das onze mapeia um-para-um:
a mais simples, `Schools → schools`, é 18 colunas contra 29, com conceitos que
não existem de um dos lados. As restantes ou se partem em várias tabelas do
SIGA, ou dependem de entidades que o YFT não tem.

Três diferenças estruturais atravessam tudo o resto, e é por elas que se começa.

### 1. O SIGA separa pessoa de papel; o YFT não

No YFT, `Users` é uma tabela só, com 22 colunas, onde cabe o administrador, o
professor e os dados de recursos humanos — `ssnit_number`, `bank_name`,
`bank_account_number`, `qualification`. O aluno está noutra tabela, `Students`,
com o nome lá dentro.

No SIGA, **`people` (22 colunas) guarda a pessoa** — nome, data de nascimento,
sexo, documento, contactos, foto — e `students` (11 colunas) é só o facto de
essa pessoa ser aluna: `person_id`, `student_number`, `admission_date`,
`status`. O vínculo à escola e o papel vivem em `school_memberships`, e os
papéis em `roles`, `member_roles` e `person_roles`.

**Consequência:** um `Students` do YFT dá origem a **duas** linhas no SIGA, e
um `Users` do YFT dá origem a uma `people` mais uma `school_memberships` mais
um papel. Não há migração que seja um `INSERT ... SELECT`.

### 2. O SIGA tem ano lectivo; o YFT tem um JSON

O YFT guarda o calendário em `Schools.academic_calendar_json` — um campo de
texto com os trimestres lá dentro, escrito por `PATCH /users/me/academic-calendar`.
O SIGA tem **`academic_years`** como tabela própria (`starts_on`, `ends_on`,
`status`), e quase tudo pendura-se nela: `class_groups.academic_year_id`,
`enrollments.academic_year_id`, `fee_plans.academic_year_id`,
`gradebooks.academic_year_id`.

**Consequência:** antes de migrar uma única linha é preciso criar o ano lectivo
no SIGA e decidir a que ano pertence cada registo do YFT. O JSON não traz essa
resposta: traz nomes de trimestres, não identificadores.

### 3. O SIGA tem RLS em todas as tabelas; o YFT não tem nenhuma

As 189 tabelas do SIGA têm RLS activa, com 359 políticas. O YFT não tem RLS:
toda a autorização está no Worker, em `requireAdmin`, `requireAdminOrTeacher` e
no `school_id` que o Worker acrescenta a cada consulta — 123 consultas escritas
à mão.

**Consequência:** quando o YFT passar a ler o Supabase, ou passa a usar a chave
de serviço (e aí é o Worker que continua a ser o único guarda, com todo o risco
concentrado nele), ou passa a autenticar-se como o utilizador e fica sujeito às
políticas — e nesse caso as 123 consultas têm de ser revistas uma a uma, porque
uma consulta que hoje devolve linhas passará a devolver vazio sem erro.
Esta é a decisão com mais consequência de todo o documento.

## Tabela a tabela

| YFT | SIGA | Veredicto |
|---|---|---|
| `Schools` (18) | `schools` (29) | Mapeia, com perdas dos dois lados |
| `Users` (22) | `people` + `school_memberships` + `roles` | Parte-se em três |
| `Students` (17) | `people` + `students` + `student_guardians` | Parte-se em três |
| `Classes` (8) | `class_groups` (19) + `grade_levels` | Mapeia; a propina sai para o financeiro |
| `Subjects` (4) | `subjects` (27) | Mapeia, o SIGA é muito mais rico |
| `SubjectClasses` (5) | `class_subjects` (11) | Mapeia quase directo |
| `Enrollments` (8) | `enrollments` + `gradebooks` + `grade_items` + `grade_scores` | **É notas, não matrículas** |
| `Transactions` (10) | `finance_invoices` + `finance_receipts` | Parte-se em dois |
| `Receipts` | `finance_receipts` (14) | Mapeia |
| `DeviceTokens` (6) | — | Não encontrei equivalente |
| `SuperAdmins` (5) | `roles` / `member_roles` | É um papel, não uma tabela |

### A armadilha do nome `Enrollments`

`Enrollments` no YFT **não é matrícula**: tem `student_id`, `subject_id`,
`term_id`, `class_score` e `exam_score`. É uma nota por disciplina e período.
O `enrollments` do SIGA é mesmo matrícula — `academic_year_id`,
`class_group_id`, `enrollment_number`, `enrolled_on`, `status`.

Traduzir pelo nome escreve notas na tabela de matrículas. No SIGA, a nota do
YFT corresponde a uma cadeia de quatro: `gradebooks` → `grade_items` →
`grade_scores`, e o `grade_scores.enrollment_id` aponta para a matrícula.
Uma linha do YFT torna-se duas ou três no SIGA, porque `class_score` e
`exam_score` são dois `grade_items` distintos.

### Campos do YFT sem destino

Levantados por leitura das colunas, não por suposição:

- `Schools.default_password` — o SIGA não tem palavra-passe por escola
- `Schools.student_id_prefix`, `teacher_id_prefix` — o SIGA numera noutro modelo
  (`students.student_number`, `enrollments.enrollment_number`)
- `Schools.teacher_can_edit_results` — o SIGA resolve-o por políticas, não por campo
- `Users.ssnit_number`, `bank_*`, `qualification`, `years_experience` — dados de
  RH que não encontrei em `people`
- `Students.balance` — o SIGA calcula saldo a partir de `finance_invoices` e
  `finance_receipts`; guardar um número a reflectir isso é duplicar a verdade
- `Classes.fee_amount`, `fee_collection_cycle`, `fee_last_applied_period` — no
  SIGA isto é `fee_plans` + `fee_items`, com `frequency` e `grade_level_id`
- `DeviceTokens` inteira

### Campos do SIGA que o YFT não sabe preencher

`schools` tem `nif`, `province`, `municipality`, `tenant_id`,
`official_authorization_reference`, `public_code`. `students` tem `admission_date`
e `status`. `enrollments` tem `attendance_rate` e `final_average`. Todas estas
exigem ou um valor por omissão decidido por ti, ou ficam nulas — e algumas são
obrigatórias.

## Migração das contas Firebase

O Firebase, aqui, é **só autenticação**: não há Firestore nem Firebase Storage,
só `firebase_auth` e `firebase_core`, e o Worker só chama `accounts:signUp` e
`accounts:update`. Os dados de negócio estão todos no D1.

Dois factos decidem o calendário:

1. **As palavras-passe não passam.** O Firebase exporta `scrypt` com parâmetros
   próprios do projecto; o Supabase Auth guarda `bcrypt`/`argon2` e não sabe
   verificar aquele formato. Não há conversão: toda a gente define palavra-passe
   nova.
2. **O `uid` está em 15 colunas** de 10 tabelas — `parent_uid` (6), `user_uid` (5),
   `uid` (4) — com chaves estrangeiras para `Users(uid)`. O Supabase Auth gera
   UUIDs novos, portanto a migração exige um mapa `uid antigo → uuid novo` e a
   reescrita dessas 15 colunas numa transacção.

**Hoje isto custa quase nada: existe uma conta.** Uma escola, um administrador,
zero alunos. Feito depois de o colégio estar a usar o sistema, é uma reposição
de palavra-passe para toda a gente no mesmo dia.

## O que precisa de decisão tua

1. **RLS ou chave de serviço** — a pergunta da secção 3. Condiciona o resto.
2. **Ano lectivo** — a que ano pertence o que já existe, e quem cria os anos.
3. **Os campos sem destino** — para cada um: inventar coluna no SIGA, guardar
   num campo livre, ou abandonar.
4. **Numeração** — `student_id_prefix` do YFT contra `student_number` do SIGA.
5. **Saldo** — calculado a partir do financeiro, ou mantido como número.

## Ordem sugerida

1. Decidir os cinco pontos acima
2. Migrar as contas enquanto são poucas
3. `Schools` → `schools`, e criar o ano lectivo
4. Pessoas: `Users` e `Students` → `people`, `students`, `school_memberships`
5. Estrutura: `Classes` → `class_groups`, `Subjects`, `SubjectClasses`
6. Matrículas em `enrollments`
7. Notas: a cadeia `gradebooks` → `grade_items` → `grade_scores`
8. Financeiro: `Transactions` → `finance_invoices` + `finance_receipts`
9. Só então apontar o Worker ao Supabase e rever as 123 consultas

## Nota de licença

`estudo/README.md` diz: «Não copiamos código, ecrãs, SQL nem assets daqui para
o SIGA». O utilizador declarou a 14/10/2026 ter autorização escrita do autor do
YFT. Se este trabalho avançar, essa regra tem de ser reescrita no mesmo PR que
traz o primeiro código, e a autorização guardada fora do repositório — senão o
repositório diz uma coisa e o código faz outra.
