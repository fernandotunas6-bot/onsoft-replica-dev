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
5. **Políticas do Storage (buckets):** o retrato de produção não as inclui, e os scripts do
   repositório têm várias versões contraditórias. Para as auditar, correr na base:
   `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'storage';`
   e `SELECT id, public FROM storage.buckets;`.
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
- **Revisto e sem alteração:** webhook AppyPay (token secreto, parâmetros limpos,
  confirmação junto da AppyPay); funções públicas de matrícula, recuperação de senha, link
  mágico e registo (todas com limite de pedidos).
- **Por decidir:** `resolveBiToEmailFn` devolve o e-mail associado a um B.I. (ver
  `CONTINUE.md`).
