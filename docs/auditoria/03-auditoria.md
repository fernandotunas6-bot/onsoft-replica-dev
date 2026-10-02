# Auditoria SIGA Plus — 3. Pessoas, matrículas e transferências

**Data:** 2026-09-23 · **Âmbito:** apenas a área 3 · **Código não alterado.**

Testes da área: `tests/students/` (5), `tests/people/` (2), `tests/enrollment/` (2),
`tests/import/` (13) e rotas `alunos`/`pessoas`. Funções de produção verificadas contra
`supabase/PRODUCTION_SNAPSHOT.json`.

---

## 3.1 Cadastro de alunos, professores, funcionários e encarregados; duplicados

**Implementado.** O cadastro não passa por `insert` directo: usa RPC `SECURITY DEFINER`
que exigem sessão, AAL2 e permissão fina — `register_student`, `register_teacher`,
`enroll_student`. Exemplo em `private.enroll_student`: recusa se
`not private.has_permission(target_school_id, 'students.enrollments.create')`.

Duplicados: o importador de alunos faz correspondência difusa com pontuação e razões,
devolvendo `status: "duplicate"` com `duplicate_of`
(`src/features/import/importers/alunos-importer.ts:90-96`). Os encarregados toleram
colisão de unicidade em vez de abortar a linha (`:186`).

## 3.2 ID sequencial de sete dígitos por escola

**Não confere com o requisito.** Existem exactamente **dois** geradores sequenciais por
escola nas funções de produção, ambos de **seis** dígitos:

- `'MAT-' || lpad(generated_number::text, 6, '0')`, de `private.enrollment_number_sequences`
  (número de matrícula);
- `'DOC-' || lpad(generated_number::text, 6, '0')`, de `private.teacher_number_sequences`
  (número de agente).

Não encontrei gerador de sete dígitos. **P2** — ou o requisito está por cumprir, ou refere
outro identificador que não localizei; a distinção precisa de quem escreveu o requisito.

**Achado que limita esta verificação (P1):** `students.student_number` é devolvido por
`private.register_student`, e **o corpo dessa função não está no repositório**. Medi a
lacuna: das **214 funções de produção, 65 não têm corpo capturado** em
`supabase/migrations/20260908210000_capture_all_db_functions.sql` — entre elas
`register_student`, as dez `enforce_*_scope` (âmbito de professores sobre notas e
avaliações), `can_manage_students`, `can_read_students`, `is_platform_admin`,
`is_school_member` e a família `hr_*` de folha salarial quase inteira.

Consequência directa: **a regra que gera o identificador do aluno e as que decidem quem
pode ler ou gerir alunos não são revisíveis**. Nenhuma revisão de código as vê, e nenhum
teste as pode verificar a partir do repositório.

## 3.3 Matrículas, rematrículas, mudanças de turma e associação de encarregados

**Implementado.** `enroll_student` gera o número e cria a matrícula; `update_enrollment_status`
gere transições. Associação de encarregados no próprio `register_student` (parâmetros
`guardian_person_id`, `relationship`, `primary_guardian`, `financial_responsibility`,
`pickup_authorization`), e `student_guardians` com `is_pickup_authorized` e
`is_financially_responsible` — este último passou a ser preenchido há dias; antes o
"Responsável Financeiro" da folha só alimentava `is_primary`.

Portais: `activate_student_portal_link`, `claim_student_portal`,
`activate_guardian_portal_link`, `claim_guardian_portal`, `portal_list_my_student_profiles`.

## 3.4 Transferências, histórico académico, financeiro e documentos

**Implementado.** `student_academic_history`, `student_status_events` e
`student_status_history` registam o percurso; `recordStudentStatusHistory` é chamado em
cada mudança de estado (`src/features/students/server.ts`), e a auditoria em `audit_logs`
foi reparada há dias — escrevia `actor_id`/`before_data`/`after_data`, colunas
inexistentes, dentro de `catch` vazio, pelo que **nenhuma mudança de estado de aluno
deixava rasto**.

Documentos da pessoa: `person_documents`, protegido por trigger
`enforce_person_document_school` (cujo corpo também não está capturado).

**Não verificado:** transferência externa ponta a ponta (exige sessão autenticada).

## 3.5 Validação de vagas, idades, pré-requisitos, equivalências e conflitos

**Parcialmente verificado.** Vagas: `class_groups.capacity` e limites por plano
(`tenant-limits`, com `buildStudentCapacity` a marcar `atLimit`/`nearLimit`, testado).
Conflitos de matrícula: `enrollments` tem unicidade por escola; `finance_contracts` é único
por `(school_id, enrollment_id)`.

**Não encontrei** validação de idade mínima/máxima, pré-requisitos entre classes, nem
equivalências. **P2** — pode estar em regras não localizadas nesta passagem, mas não há
teste que as nomeie.

## 3.6 Importação Excel com pré-visualização, validação, relatório e reversão

**Implementado e robusto.** 22 módulos registados, cada linha validada em `analyzeRow`
antes de gravar, com `status` (`valid`/`warning`/`error`/`duplicate`), avisos e erros por
linha persistidos em `import_rows`. **Todos os 22 verificam `ctx.dryRun`** — garantido por
teste de regressão que percorre o registo (`tests/import/dry-run.test.ts`). Auditoria da
importação em `import_audits`, e `import_jobs` tem estado `rolled_back`.

Cinco importadores escreviam para tabelas do modelo antigo (`courses`, `invoices`,
`payments`, `class_schedule_slots`) e foram remapeados; o `avaliacoes` escolhia um diário
arbitrário da escola. Corrigidos e cobertos.

**Não verificado:** reversão real de um lote (o estado existe; não localizei o caminho que
o executa).

## 3.7 Desistência, suspensão, reingresso e conclusão

**Implementado.** `enrollments.status` com `ended_on`/`end_reason`, `students.status`, e
`student_status_events`/`student_status_history` com histórico. `academic-status.ts` e
`status-history.ts` têm testes próprios.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P1** | 65 de 214 funções de produção sem corpo no repositório — inclui `register_student`, as 10 `enforce_*_scope`, `can_read_students`/`can_manage_students` | medido contra o retrato |
| **P2** | Numeração sequencial é de 6 dígitos (`MAT-`/`DOC-`), não 7 | funções de produção |
| **P2** | Sem validação localizável de idades, pré-requisitos ou equivalências | — |
| **P3** | Reversão de lote de importação: estado existe, caminho não localizado | `import_jobs.rolled_back` |
| **P3** | Transferência externa não verificada ponta a ponta | exige sessão |

**P0: nenhum.** As vias de escrita passam por RPC com AAL2 e permissão fina.
