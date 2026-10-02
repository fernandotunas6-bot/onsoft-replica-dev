# Auditoria de segurança — políticas RLS da produção (2026-09-25)

**Fonte:** `supabase/PRODUCTION_SNAPSHOT.json` (296 políticas, retrato de 2026-09-20), os
scripts `supabase/*.sql` e o código em `src/`.

**Correcção:** `supabase/migrations/20260925190000_harden_member_wide_policies.sql`,
protegida por `tests/security/member-wide-policies-hardening.test.ts`. **Ainda não está
aplicada.**

## A raiz

`public.is_school_member(school_id)` é verdadeiro para **qualquer** membership activa,
incluindo alunos e encarregados. As políticas do Postgres somam-se: basta uma permitir.
Várias tabelas tinham uma política correcta por papel e, ao lado, uma política antiga
"qualquer membro" que a anulava. Como os scripts dão `INSERT/UPDATE` a `authenticated`,
qualquer aluno podia escrever directamente pela API REST do Supabase.

## Achados

| Gravidade | Tabela | O que um aluno podia fazer | Correcção |
|---|---|---|---|
| Crítica | `school_invitations` | Criar um convite com papel `owner`/`admin` para o próprio e-mail e aceitá-lo, tornando-se administrador | Só servidor |
| Crítica | `staff_module_grants` | Conceder-se permissões de módulo (as permissões sobrepõem-se ao cargo) | Só `is_school_admin` da escola |
| Alta | `siga_assessment_scores`, `siga_assessment_items` | Alterar notas | Escrita só pelas políticas por papel e pelo servidor |
| Alta | `siga_attendance_*` | Alterar presenças e justificações | Só leitura para membros |
| Alta | `student_academic_history`, `student_status_history` | Alterar histórico académico e estado | Só leitura para membros |
| Alta | `school_integrations` | Alterar configuração de integrações (chaves de API) | Só servidor |
| Alta | `siga_direct_messages` | Ler todas as mensagens directas da escola; o Realtime do `StaffMessenger` também as entregava | Só remetente e destinatário |
| Alta | `person_documents` | Ler e alterar documentos pessoais | Ficam as políticas `can_read/can_manage_students` |
| Média | `finance_payment_plans`, `siga_access_cards`, `siga_access_logs`, `siga_turnstile_devices` | Alterar planos de pagamento, cartões e registos de catraca | Só leitura para membros |
| Média | `siga_files`, `siga_file_events` | Ler e alterar os metadados de todos os ficheiros da escola | Só servidor |
| Média | `siga_cash_expenses`, `import_templates`, `siga_attendance_audits`, `communication_dispatches` | Ler | Só servidor |

## Como se provou que nada parte

- **Cliente usado pelo código:** análise de cada `.from("tabela")`. Só o `dashboard/server.ts`
  lê `siga_assessment_scores`, `siga_attendance_sessions`, `terms` e `import_jobs` com o JWT
  do utilizador, e essas leituras mantêm-se. Só o `access/grants.ts` escreve com o JWT (em
  `staff_module_grants`, apenas para Administrador), e fica coberto por `is_school_admin`.
- **Tempo real:** o Realtime só é usado em `siga_direct_messages`, e a nova política continua
  a entregar as mensagens a quem as envia e a quem as recebe.
- **Funções `SECURITY INVOKER` chamadas com o JWT:** `enroll_student`, `register_student` e
  `register_payment` não tocam nestas tabelas.

## Por fazer

1. **Tabelas `hr_*` (salários, contratos, folha salarial):** a leitura continua aberta a
   qualquer membro. As funções da folha salarial (`hr_create_payroll_run`, …) são
   `SECURITY INVOKER` e os corpos não estão no retrato, por isso não se pode provar que
   continuariam a funcionar. Capturar os corpos e depois restringir a leitura a
   Administrador/Tesouraria.
2. **Políticas de RH com `current_profile_role() = 'Administrador'`:** na versão do
   repositório (`APPLY_MISSING_FROM_VERIFY.sql`), a função devolve o **código** do papel
   (`owner`, `admin`, …). Se for essa a versão em produção, essas políticas nunca
   correspondem. Confirmar na base.
3. **`current_school_id()`** devolve a primeira escola do utilizador, não a activa. As
   políticas que o usam falham para quem tem várias escolas. As novas usam
   `is_school_admin(school_id)`.
4. **Leituras ainda largas:** notas, presenças, `import_jobs` e `terms` continuam legíveis
   por qualquer membro. É preciso passar a ler por papel/turma sem esvaziar o dashboard do
   aluno e do encarregado.
5. **Políticas do Storage (buckets):** levantamento estático feito a 2026-09-27 — ver
   «Storage — ponto 5» no fim deste documento. Falta o lado da base: correr
   `docs/agents/SIGA_auditoria_storage.sql` (só leitura) e trazer o resultado. Cinco
   achados ficam por confirmar até lá.
6. **Planos de aula:** corrigidos em `20260925162000`, também por aplicar.

## Segunda passagem (mesmo dia)

- **Atalho de login de desenvolvimento removido.** O `AuthGate` tinha um login automático com
  credenciais fixas (código morto: o build já o eliminava do browser), e a função de servidor
  `ensureDevBypassSession` estava exposta pela rede, protegida só por uma variável de
  ambiente. Criava ou reactivava a conta `dev@siga.local` como **dona da primeira escola**,
  com senha fixa. **Verificar na produção se essa conta existe** e, se existir, apagá-la
  (Authentication → Users). Verificar também `admin@escola.ao`, cuja senha estava no código.
- **OTP:** limite de 20 envios por hora por IP, qualquer que seja o destino.
- **Acções sobre a conta entre escolas.** A identidade é partilhada entre escolas.
  `resetStaffPasswordDirect` deixava um administrador da escola A mudar a senha de quem também
  pertence à escola B, e assim tomar-lhe a conta, mesmo que fosse administrador em B: a
  protecção usava o `cargo` global do perfil. `setSystemAccountDisabled` bloqueava a conta
  inteira, tirando-lhe também o acesso a B. Agora a senha só é redefinida directamente se a
  pessoa pertencer só a esta escola e não for administradora em nenhuma. A suspensão só bloqueia
  a conta toda se a pessoa não tiver outras escolas activas; caso contrário, suspende só nesta.
  Protegido por `tests/access/cross-school-account-actions.test.ts`.
- **Link de acesso copiado (`resendSystemInvite`).** Devolvia ao ecrã um link de recuperação que
  abre a conta a quem o tiver. Qualquer pessoa da **Secretaria** conseguia assim entrar na conta
  de um **Administrador** da mesma escola, e em contas de outras escolas. Agora: administradores
  (em qualquer escola) e contas com outra escola activa só por "Enviar E-mail"; a Secretaria não
  copia links de pessoal administrativo; cada cópia fica registada em `audit_logs`.
- **Convite com cargo de administrador (`createSchoolInvitation`).** Não verificava o papel
  pedido: a Secretaria criava um convite `owner`/`admin` (por exemplo para um segundo e-mail
  seu), aceitava-o e tornava-se administradora. Agora exige Administrador, como já fazia
  `inviteSystemUser`.
- **Cargo global (`updateSystemAccountCargo`).** Só um Administrador altera quem é administrador
  noutra escola. O `profiles.cargo` global só muda se a pessoa não tiver outras escolas activas.
- **Revisto e sem alteração:** webhook AppyPay (token secreto, parâmetros limpos,
  confirmação junto da AppyPay); funções públicas de matrícula, recuperação de senha, link
  mágico e registo (todas com limite de pedidos).
- **Login por B.I. revelava o e-mail.** `resolveBiToEmailFn` era público e devolvia o e-mail
  de qualquer B.I. ou telefone. Agora `signInWithIdentifierFn` verifica a senha no servidor e
  devolve só a sessão; B.I. desconhecido e senha errada dão a mesma resposta. Protegido por
  `tests/access/bi-login.test.ts`. **Antes de publicar:** subir o limite "Sign-ups and
  sign-ins" do Supabase Auth (ver `CONTINUE.md`).

## Permissões por módulo só no browser

As permissões por conta (Nenhum/Leitura/Escrita/Total, em Acessos) só eram respeitadas no
browser. Com "Nenhum", a conta deixava de ver o módulo, mas continuava a chamar as funções dele
directamente. As 176 chamadas de verificação de papel nos módulos passam a
`requireSgaWriterFor("<módulo>", …)`, que também aplica "Nenhum" no servidor. Um teste
estrutural impede novas funções sem esta verificação.

**"Leitura" também aplicada (mesmo dia):** as funções que alteram dados usam
`requireSgaWriterForWrite`, que bloqueia "Nenhum" e "Leitura". São 141 chamadas directas e 8
por auxiliares locais (AppyPay, alunos em risco, pipeline alumni). A classificação: GET é
leitura; POST é escrita, excepto nomes de leitura (`list`, `get` — mas não `getOrCreate` —,
`export`, `download`…) e as análises por IA que não gravam. Um teste impede uma função de
escrita de usar a verificação de leitura.

**RH (2026-09-26):** as funções de RH e folha salarial verificavam o papel (Administrador,
Tesouraria) mas não as permissões por módulo. Agora também respeitam "Nenhum" e "Leitura" do
módulo Financeiro (16 funções de escrita pedem modo escrita).

**Elevação por permissão (2026-09-26):** `requireSgaWriterFor`/`ForWrite` deixam entrar quem
não tem o cargo da função quando a Administração lhe deu a permissão do módulo, com três
limites (`grantElevates`): só Secretaria, Tesouraria e Professor; nunca funções só do
Administrador; "Leitura" só consulta, "Escrita"/"Total" alteram. `setStaffModuleGrant` passa a
exigir que a conta pertença à escola e não seja aluno nem encarregado. As verificações próprias
do RH (Administrador/Tesouraria) não elevam: o RH continua só para esses cargos.

## Funcionalidades simuladas apresentadas como reais

- **Encaminhamento de e-mail institucional.** As definições da escola gravavam a rota como
  `active` sem criar nada na Cloudflare, e o ecrã mostrava-a como activa. Passa a `pending`
  até a regra existir de facto (`createEmailRoute` só marca `active` quando a Cloudflare
  confirma).
- **Caixas Google Workspace (`mailbox-google.ts`).** Com credenciais configuradas,
  respondiam "caixa criada" sem chamar o Google. Agora dizem que ainda não está implementado.
- **`src/integrations/google/server-workspace.ts`.** Respondem "enviado com sucesso" sem
  enviar nada. Hoje ninguém as importa. Não foram apagadas porque o PR #29 reescreve este
  ficheiro com a implementação real; **não as usar antes disso**.

## Funções que só exigiam pertencer à escola (terceira passagem)

As funções de servidor lêem com a chave de serviço, que ignora o RLS. Muitas só confirmavam
que a conta era membro da escola, e alunos e encarregados também são membros.

- **Catracas e cartões.** Um aluno podia obter o cartão virtual de outro aluno (com o segredo
  do QR que abre a catraca), exportar os segredos de todos os cartões, ler as chaves API dos
  dispositivos, simular leituras e ver as entradas e saídas de todos. Agora as funções da
  escola inteira exigem Administrador ou Secretaria, e o cartão virtual só é o próprio ou o
  dos educandos. As chaves novas de dispositivo passam de 32 para 128 bits; **as chaves
  antigas (`KEY-` seguido de 8 caracteres) devem ser regeneradas** nos dispositivos.
  Protegido por `tests/security/catracas-access.test.ts`.
- **Fichas de alunos e pessoas.** `searchStudents` devolvia a qualquer membro o e-mail, o
  telefone, o B.I. e a situação financeira de todos os alunos; `getStudentProfile`,
  `getStudentStatusHistory`, `getStudentAcademicHistory` e `getPerson` abriam qualquer ficha.
  A nova regra `src/features/students/student-scope.ts` dá ao pessoal (Administrador,
  Secretaria, Tesouraria, Professor) todos os alunos, ao aluno só o seu e ao encarregado só
  os educandos. `listEnrollments`, `findPersonDuplicates` e `listStaffDirectory` ficam só para
  o pessoal.
- **Justificações de faltas.** Qualquer membro submetia uma justificação em nome de qualquer
  aluno, e podia apontá-la para o registo de presença de outro aluno (a aprovação marcava
  esse registo como justificado). Agora o aluno tem de estar no âmbito da conta e o registo
  tem de ser dele. Protegido por `tests/security/student-scope.test.ts`.

**Segunda ronda do mesmo critério:**

- **Pautas e avaliações.** A fachada `academic/server-secure-legacy.ts` já filtrava por
  professor, mas as funções antigas que ela chama (`listTermGrades`, `listAssessments`,
  `getTeacherWorkspace`, `listPedagogicalWorkspace` em `server-legacy.ts`) continuavam
  expostas pela rede: o módulo é carregado no browser pelos re-exports. Passam a exigir
  Administrador ou Secretaria por si.
- **Comunicações enviadas** (destinatários, e-mails, telefones, erros do fornecedor) e
  **analítica/pesquisas alumni:** só Administrador e Secretaria.
- **Comunicados:** alunos e encarregados só vêem os já enviados e não vêem os dirigidos ao
  corpo docente.
- **Planos de aula:** alunos e encarregados só vêem os publicados.
- **Documentos:** alunos e encarregados só vêem os pedidos e a lista dos seus alunos.

- **Folha de chamada:** qualquer membro abria a lista de presenças de qualquer turma, e podia
  abrir sessões para turmas de outra escola (o id não era verificado). Passa a exigir o corpo
  docente, e a turma e a disciplina têm de ser desta escola. Ao gravar a chamada, só entram
  alunos matriculados nessa turma.

**Revisto sem alteração:** mensagens directas (já filtradas por remetente/destinatário),
definições da escola (os dados bancários são os que os encarregados usam para pagar),
estado das integrações (não devolve chaves).

**Contactos dos professores (decidido 2026-09-26):** `listTeachers` mostra e-mail e telefone
a alunos e encarregados por omissão, mas cada professor pode ocultá-los em Perfil → "Contacto
para alunos" (`teacher-contact-visibility.ts`, domínio `teacher_contact_visibility` em
`school_settings`). O pessoal da escola vê sempre. A escolha aplica-se antes da pesquisa, para
que procurar pelo e-mail não o revele.

## Contactos da conta e aulas Zoom (quarta passagem)

- **Mudar o e-mail** não pedia a senha, não avisava o endereço antigo e não tinha limite.
  Como a recuperação de senha segue o e-mail, uma sessão deixada aberta bastava para tomar a
  conta. Agora exige a senha actual (verificada no Supabase Auth), limita a 5 pedidos por
  hora, avisa o e-mail antigo e deixa de devolver a mensagem crua do Supabase.
- **Mudar o telefone** (que também recupera a senha por código): exige a senha actual, e o
  código só é aceite pela conta que o pediu (`verification_otps.user_id`).
- **Link da aula Zoom:** qualquer membro obtinha o link de qualquer turma. Alunos e
  encarregados só o recebem se o aluno estiver matriculado nessa turma.
  Protegido por `tests/security/account-contact-change.test.ts`.
- **Recuperação de senha por código.** A conta era encontrada pelo e-mail da ficha escolar
  (`people.email`, preenchido pela secretaria ou por formulários) ou pelo telefone do perfil
  (gravável sem verificação em `updateCurrentProfile`). Quem controlasse esse contacto
  redefinia a senha de uma conta que não era sua, e uma sessão aberta chegava para gravar um
  telefone e recuperar a conta por ele. Agora (`reset-account-resolver.ts`) só vale o e-mail
  da conta no Supabase Auth, ou um telefone da conta no Auth ou confirmado por código pela
  própria conta. Protegido por `tests/security/reset-account-resolver.test.ts`.
- **Mudar a senha** termina as outras sessões da conta.

**No Supabase (Authentication → Providers → Email):** activar "Secure password change". A
verificação da senha actual no ecrã é só no browser; sem essa opção, uma sessão aberta chama
o Supabase directamente e muda a senha.
- **Aceitar convite.** A verificação do destinatário usava o e-mail das claims e era saltada
  quando não vinha (conta só com telefone): quem tivesse o link aceitava o convite, mesmo de
  administrador. Agora usa o e-mail da conta no Auth, falha fechado e exige e-mail confirmado.
- **Ligação conta→ficha harmonizada.** O perfil ligava a conta à ficha também pelo e-mail
  confirmado, mas as verificações do servidor (âmbito de alunos, cartão virtual, histórico de
  presenças) só pelo `user_id`. Um encarregado ligado só pelo e-mail via o educando no ecrã e
  era recusado no servidor. Todas usam agora `resolveVerifiedAccountEmail`.
- **XSS nos modelos de impressão.** A Secretaria pode personalizar os modelos (HTML
  Handlebars), e o documento era escrito num iframe da mesma origem, sem isolamento: um
  `<script>` num modelo corria quando um Administrador imprimisse e podia roubar-lhe a sessão
  (escalada Secretaria → Administrador). Agora o iframe de impressão tem
  `sandbox="allow-same-origin allow-modals"` (sem `allow-scripts`; verificado no Chromium: o
  script não corre e `print()` funciona), a pré-visualização tem `sandbox=""`, e o servidor
  recusa modelos com scripts, eventos `on…=`, `javascript:` ou documentos embutidos.
  Protegido por `tests/security/print-template-xss.test.ts`.
- **Matrícula pública:** limite de 10 candidaturas por hora por IP.
- **HTML nos e-mails.** Os modelos de e-mail (convite, recuperação, link mágico, confirmação,
  mudança de e-mail, código OTP) punham o nome da escola, o cargo e o logótipo no HTML sem
  escape. Com o registo público, qualquer pessoa cria uma escola com um nome que é HTML
  (um link falso) e os convites saem do domínio SIGA com esse conteúdo. Agora tudo é
  escapado e o logótipo só é aceite por `https`.
- **Envio de e-mail com a chave da plataforma** (`sendSchoolResendEmail`). Uma escola sem
  chave Resend própria usava a da plataforma, com HTML livre, qualquer destinatário e
  qualquer remetente: um canal de phishing com a reputação do domínio SIGA. Agora o HTML vem
  sempre do texto escapado; com a chave da plataforma, só para contactos da escola, com o
  remetente do sistema e 20 envios por hora. O WhatsApp com o token da plataforma tem o
  mesmo limite. Protegido por `tests/security/email-html-injection.test.ts`.
- **Carregamentos.** O avatar aceitava qualquer tipo e tamanho, e a extensão vinha do nome do
  ficheiro para o caminho do Storage (com `upsert`): um nome com `/` escrevia fora da pasta da
  conta. Agora só PNG/JPG/WebP até 4 MB, com a extensão derivada do tipo. A importação recusa
  ficheiros acima de 25 MB antes de os ler.
- **CSV:** a protecção contra fórmulas cobre também tabulação e retorno no início, e deixa de
  transformar números negativos em texto (`-500` saía como `'-500`).
- **PayFlow.**
  - PIN do aluno: o limite de tentativas era por aluno **e IP** (5 em 15 min); rodando
    endereços, um PIN de 4 dígitos adivinhava-se. Soma-se um limite por aluno, qualquer IP:
    30 falhas em 24 h bloqueiam 1 h.
  - Redireccionamento depois do SSO: recusava `//`, mas `/\evil.com` e `/\t/evil.com`
    passavam (os browsers resolvem-nos para outro site).
  - Login de administrador compara a chave em tempo constante.
  - Revisto sem alteração: SSO (HMAC, 60 s, anti-replay por `jti`), modo de produção por
    omissão, chave de integração com comparação segura.
  - Testes: `node --experimental-strip-types --test painel/payflow/tests/*.test.mjs` (os 2 de
    HTML precisam do build).
- **Registo de auditoria das acções de acesso (2026-09-26).** Só a cópia de link de acesso
  ficava em `audit_logs`. Passam a ficar também: convite de utilizador, convite criado,
  revogado e aceite, mudança de cargo, suspensão/reactivação de conta, senha redefinida
  directamente e permissões por módulo (definidas e repostas). Escrita centralizada em
  `src/features/audit/record-audit.ts` (o RLS de `audit_logs` não deixa utilizadores gravar).
  Protegido por `tests/security/access-audit.test.ts`.
- **Notas e presenças (2026-09-26).**
  - Verificado: os triggers `enforce_teacher_*_scope` estão na produção e usam o actor gravado
    (`recorded_by`), por isso o professor não lança notas fora das suas turmas mesmo com a
    chave de serviço.
  - `siga_assessment_scores` só guarda a nota anterior; uma nota mudada duas vezes perdia a
    original. Cada alteração de nota já lançada fica agora em `audit_logs`
    (`grades.assessment_score_changed`, com de/para).
  - `editFinalizedAttendanceCall` deixava um professor corrigir a chamada fechada de outro e
    aceitava alunos de fora da turma. Tem agora as mesmas regras da chamada normal.
  - Anular fatura exige motivo (ecrã e servidor).
- **Verificação de documentos oficiais (2026-09-26).** O "código de validação" impresso era um
  hash calculado no browser a partir de dados públicos (escola, aluno, ano): qualquer pessoa o
  reproduzia num documento forjado. O QR nunca era gerado e não havia onde verificar, mas o
  certificado dizia que havia. Agora `issuePrintDocument` regista cada emissão no servidor
  (`audit_logs`, `documents.issued`) com um código aleatório `SIGA-XXXX-XXXX`, e o documento
  leva esse código e um QR para `/verificar` (pública, 20 verificações/min por IP), que mostra
  documento, escola, iniciais do titular e data. Os códigos antigos que continuam noutros
  ecrãs (pautas) passam a chamar-se "Referência", sem prometer verificação.
- **Recibos verificáveis com valor (2026-09-26).** A verificação passa a mostrar também o número
  do documento e o valor (recibos e faturas), para que um recibo real editado para outro valor
  não "verifique". O PDF de alternativa (`export-pdf.ts`) desenhava um QR falso (quadrados
  gerados do código, ilegíveis por qualquer leitor) com "Validar:"; passa a mostrar só
  "Referência:".
- **Mensagens directas e protecção de menores (2026-09-26).** Qualquer membro via o directório
  com todos os membros da escola e escrevia em privado a qualquer um: um encarregado podia
  escrever a um aluno que não é seu educando, e alunos trocavam mensagens sem supervisão.
  Agora alunos, encarregados e contas sem cargo só vêem e só escrevem ao pessoal da escola
  (cargo nesta escola, via `member_roles`). A política RLS "Send school direct messages"
  deixava contornar o servidor pela API REST; a migração
  `20260926100000_direct_messages_server_only_insert.sql` retira-a (o browser só lê, por
  Realtime). As 5 migrações por aplicar estão juntas em `docs/agents/SIGA_aplicar_migracoes.sql`.
- **Comunicados** (e-mail, WhatsApp, lista do Resend) respeitam quem os desligou; a lista do
  Resend é única por escola.

## Storage — ponto 5 (quinta passagem, 2026-09-27)

Levantamento do que o repositório prova sozinho. **Nenhuma destas conclusões é sobre a
produção**: as políticas do esquema `storage` nunca entraram em nenhum retrato, porque
`scripts/siga/capture-db-snapshot.mjs` filtra `where schemaname='public'`. O que a base
tem está por confirmar com `docs/agents/SIGA_auditoria_storage.sql` (só leitura).

**Três buckets, e só três.** `school-logos` (público), `avatars` (privado) e `siga-files`
(privado). Não há outro nome de bucket no código.

**O que passa pela RLS do Storage e o que não passa.** As leituras não passam: os bytes
saem sempre por URL assinada gerada no servidor com a chave de serviço
(`arquivos/server.ts:1394` e `:1443`, `auth/server.ts:523`), que ignora a RLS. As
**escritas** passam todas: os quatro envios são feitos do browser, com a sessão do
utilizador — `arquivos/FileBrowser.tsx:653`, `arquivos/apply-person-photo.ts:40`,
`school/settings-school-panel.tsx:365` e `school/settings-identity-panel.tsx:157`. Para os
envios, a política do Storage é a única fronteira que existe.

**Achado (P1): os metadados estão guardados por papel e área; os bytes podem não estar.**
`siga_files_select_scoped` (no retrato) só deixa ler a linha a quem tem o papel certo, e
`secretaria` só a Administrador e Secretaria. Mas o caminho do objecto é
`<escola>/<ano>/<mês>/<área>/<utilizador>/<id>-<nome>` (`arquivos/local-store.ts:49`), com a
área lá dentro. Se a política que estiver na base for a do repositório — `Staff can read
siga files`, `APPLY_ENROLLMENT_AND_PREMIUM.sql:679`, que só compara
`split_part(name,'/',1)` com `current_school_id()` — então qualquer membro autenticado,
aluno incluído, lista `<escola>/2026/09/secretaria` pela API do Storage e descarrega o que
lá estiver. O papel e a área que a tabela impõe deixam de valer, porque o ficheiro não é
pedido à tabela. **Confirmar na base antes de tratar isto como real.**

**Achado (P1): três versões contraditórias das políticas de escrita de `school-logos`, e só
a base sabe qual ficou.** Os três ficheiros são corridos à mão, sem ordem registada (ver
`scripts-supabase-corridos-a-mao`):

| Ficheiro | `WITH CHECK` do upload | Consequência |
|---|---|---|
| `supabase/APPLY_IN_SQL_EDITOR.sql:169` | `name ~ '^[0-9a-f-]{36}/logo-…'` | prefixo de **qualquer** escola |
| `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql:119` | `split_part(name,'/',1) = current_school_id()` | só a própria, sem guarda de nulo |
| `supabase/HARDEN_TENANT_ISOLATION.sql:122` | o mesmo, **mais** `current_school_id() IS NOT NULL` | só a própria |

Se a que ficou for a primeira, qualquer utilizador autenticado de qualquer escola escreve —
e, pela política de UPDATE, **substitui** — o logótipo de qualquer outra escola, num bucket
público. É o padrão que a memória já registou: o `APPLY` desfaz o `HARDEN`.

**Achado (P2): `current_school_id()` devolve a primeira escola, não a activa** (ponto 3
desta lista). O que é novo é que isso agora também decide escritas de ficheiros: um
administrador de duas escolas, ao trabalhar na segunda, tem o envio de logótipo e de
ficheiros recusado pela política, sem explicação possível no ecrã.

**Achado (P1): `private.storage_school_id` só reconhece caminhos de 4 segmentos; a
aplicação escreve 6.** A função existe na produção (retrato, `funcoes[79]`), o corpo está em
`supabase/migrations/20260908210000_capture_all_db_functions.sql:2807`, e **nenhuma política
de `public` a usa** — logo foi escrita para uma política do `storage`. O regex exige
`<uuid>/<seg>/<seg>/<ficheiro>`. Os caminhos reais são
`<escola>/<ano>/<mês>/<área>/<utilizador>/<id>-<nome>` (6) e `<escola>/logo-<ts>.<ext>` (2).
Se alguma política do Storage a usar, **todos os envios do browser são recusados** — e
`FileBrowser.tsx:653` trata a recusa como `backend = "local"`: o ficheiro fica no IndexedDB
do próprio browser, a lista mostra-o, e o utilizador fica convencido de que o guardou na
escola. `apply-person-photo.ts:43` pelo menos falha à vista.

**Achado (P2): o bucket público pode ainda ter fotografias de pessoas.**
`supabase/AUDIT_LEGACY_PUBLIC_PHOTOS.sql` descreve fotografias enviadas para `school-logos`
(público) em `avatars/<person_id>-<ts>.<ext>`. O código já não as cria — as fotos vão para
`siga-files` (`apply-person-photo.ts:11-16`) — mas **nada prova que as antigas foram
removidas**; o script é de auditoria e não apaga. Num bucket público, um objecto é legível
sem sessão por quem souber o caminho. Muitas destas fotografias são de menores.

**O que só a base responde.** Correr `docs/agents/SIGA_auditoria_storage.sql` e trazer: que
buckets existem e quais são públicos, as políticas inteiras do esquema `storage`, os GRANT
de `anon`/`authenticated` sobre `storage.objects`, quantos objectos há fora do padrão em
`school-logos` (as fotografias antigas) e quantos caminhos a `private.storage_school_id`
reconhece. Enquanto isso não chegar, os cinco achados acima são hipóteses fundamentadas no
repositório, não factos sobre a produção.

## Servidor MCP e consentimento OAuth (sexta passagem, 2026-09-28)

A integração do Lovable acrescentou ao SIGA Plus uma **superfície nova alcançável da
Internet**: `/mcp` (`src/routes/mcp.ts`), o metadado `/.well-known/oauth-protected-resource`
e o ecrã de consentimento `/.lovable/oauth/consent`. Um agente de IA externo liga-se à conta
de um utilizador e chama ferramentas em nome dele. Revisto antes de ir para produção.

**O desenho está certo onde mais importa.** `supabaseForUser` (`src/lib/mcp/supabase.ts`)
usa a **chave publicável** com o token do utilizador no cabeçalho — a RLS corre como quem
ligou o agente, não como chave de serviço. As duas ferramentas são de leitura
(`readOnlyHint`), verificam `ctx.isAuthenticated()` e não recebem `school_id` por argumento:
o alcance vem da RLS. É a decisão difícil, e foi tomada bem.

**Achado (P1): `trustForwardedHost` está ligado, e este sítio não corre onde isso é seguro.**
O próprio ficheiro gerado avisa, em `src/routes/[.well-known]/oauth-protected-resource.ts`:

> Trusting X-Forwarded-Host/-Proto is safe on Lovable hosting only (its proxies overwrite
> both headers); remove these options behind other proxies.

O SIGA Plus é publicado em **Cloudflare Workers**, em `portal-siga.com`
(`scripts/deploy-all.mjs:159`, `scripts/deploy-cf.mjs`). A Cloudflare **não** reescreve
`X-Forwarded-Host`: um cabeçalho posto pelo cliente atravessa-a. Com `trustForwardedHost`,
o identificador do recurso anunciado no metadado OAuth passa a ser escolhido por quem faz o
pedido, e um cliente MCP que confie nesse metadado pede ao Supabase um token para um recurso
que não é este. `src/routes/mcp.ts` tem as mesmas duas opções.

Os dois ficheiros são gerados pelo plugin do Vite e trazem `AUTO-GENERATED … do not edit` —
tomar conta deles é apagar essa linha, e passam a não receber actualizações do plugin. É uma
escolha de manutenção que não é do agente: **fica aqui registada para o dono decidir**, e
não foi alterada. A correcção é retirar `trustForwardedHost`/`trustForwardedProto` dos dois
ficheiros, ou confirmar na Cloudflare que existe uma regra que apaga esses cabeçalhos à
entrada.

**Achado (P3): o ecrã de consentimento não diz quem é o agente.**
`src/routes/[.]lovable.oauth.consent.tsx:63` mostra `details.client.name` — um nome escolhido
por quem registou o cliente OAuth. Nada no ecrã mostra o domínio de regresso, e um cliente
registado com o nome «SIGA Plus» é indistinguível do próprio sistema. Mostrar o anfitrião do
`redirect_url` ao lado do nome fecha isto.

**Revisto sem alteração.** `list_class_groups` limpa `%,()` antes de montar o filtro `or=`
do PostgREST, o que chega para não abrir um segundo filtro. `whoami` devolve só o `id` e o
e-mail da própria conta. A migração `20260927190000_register_payment_net_of_discount.sql`
mantém as duas verificações (`is_aal2` e `finance.payments.create`) e o `FOR UPDATE` da
versão capturada — corrige o desconto sem afrouxar nada.

**Por confirmar (não é achado):** nessa mesma função, uma fatura com desconto igual ao valor
fica com total zero, e aí **qualquer** pagamento é recusado por «excede o saldo» e a fatura
nunca passa a `paid`. Uma bolsa de 100% ficaria em dívida para sempre. Saber se isso é
alcançável é decidir o que o produto faz com um desconto total — não é correcção de agente.
