-- As últimas quatro escritas abertas a qualquer membro da escola.
--
-- `public.is_school_member(school_id)` é verdadeiro para alunos e encarregados
-- (regra 4 de `docs/agents/DATABASE_RULES.md`). Depois de aplicadas as migrações de
-- 25 e 26/09, o retrato de 2026-09-27 mostrava seis políticas de ESCRITA cuja única
-- condição era essa. Duas fecharam com `20260926120000` (departamentos e cargos de
-- RH). Estas são as outras quatro, e nenhuma tinha correcção escrita em lado nenhum.
--
-- Em todas, a aplicação escreve por `service_role`. Confirmado ficheiro a ficheiro:
-- `enrollment/server.ts` chama `requireSgaWriterForWrite("pessoas", …)` e só depois
-- `loadSgaAdminClient()`; o motor de importação recebe o cliente privilegiado em
-- `import/server.ts`; `saas/school-bootstrap.ts` corre no arranque de escola. Não há
-- um único caminho em que o browser escreva nestas tabelas -- a política servia
-- apenas para permitir o que ninguém faz.
--
-- Idempotente. NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

-- ---------------------------------------------------------------------------
-- 1) enrollment_applications
--
-- O UPDATE por membro sai. Fica a inserção pública -- `TO anon`, e guardada por
-- `status = 'pending'` mais um EXISTS sobre um formulário aberto: é o formulário de
-- matrícula no sítio público, e tem de continuar a funcionar.
--
-- A LEITURA também aperta, e não é arrumação. O `payload` de uma candidatura tem
-- `person: { full_name, national_id, phone, email, birth_date, gender }` -- dados
-- pessoais de menores. Com `is_school_member` sozinho, qualquer aluno ou encarregado
-- da escola listava todas as candidaturas com esses campos dentro. A regra 4 proíbe
-- `is_school_member` sozinho precisamente em dados de alunos.
--
-- A guarda passa a ser a mesma que `students` e `people` já usam para os mesmos
-- dados: `can_read_students()`, que é Administrador, Secretaria, Direcção,
-- Coordenação ou Professor.
--
-- `src/routes/alunos/index.tsx` subscreve alterações desta tabela por realtime. O
-- realtime respeita o RLS: quem não pode ler a linha não recebe o evento. A
-- subscrição existe só para invalidar a contagem de candidaturas pendentes, que é um
-- indicador de secretaria -- deixar de chegar a alunos é o comportamento correcto,
-- não uma regressão.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;

DROP POLICY IF EXISTS "Read enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Read enrollment applications in own school"
  ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

-- Escrita fora do browser. `anon` mantém o INSERT, que é o da matrícula pública;
-- `authenticated` não tinha política de INSERT nenhuma, logo já estava recusado --
-- revogar o privilégio só torna isso explícito em vez de implícito.
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_applications FROM authenticated;
REVOKE UPDATE, DELETE ON public.enrollment_applications FROM anon;

-- ---------------------------------------------------------------------------
-- 2) enrollment_forms
--
-- `Manage enrollment forms in own school` era `FOR ALL`: um aluno podia apagar o
-- formulário de matrícula da escola, ou abri-lo e fechá-lo. Sai por inteiro. A parte
-- de leitura que ela também dava já está coberta por `Read enrollment forms in own
-- school`, que fica.
--
-- As duas políticas de leitura ficam como estão, e `anon` mantém o SELECT: é assim
-- que a página pública mostra um formulário aberto. Aqui `is_school_member` sozinho
-- na leitura é aceitável -- um formulário de matrícula é para ser visto, tanto que
-- há uma política que o mostra ao público.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;

REVOKE INSERT, UPDATE, DELETE ON public.enrollment_forms FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_forms FROM anon;

-- ---------------------------------------------------------------------------
-- 3) finance_invoice_events e student_status_events
--
-- Estas duas não são escritas por código nenhum: `grep` em `src/` não devolve uma
-- única referência fora dos tipos gerados. São alimentadas por triggers, que correm
-- como o dono da tabela e não dependem destes privilégios.
--
-- A política de INSERT era `school_id = current_school_id()` -- sem papel, sem
-- permissão. Servia só para permitir a alguém autenticado forjar eventos de factura
-- e de mudança de estado de aluno directamente pelo PostgREST, sem passar pela
-- operação que os devia ter gerado. Uma trilha de auditoria que o auditado pode
-- escrever deixa de ser trilha.
--
-- A leitura fica: são registos de auditoria por escola, e há ecrãs que os podem vir
-- a mostrar. `anon` perde tudo -- tinha o privilégio de SELECT sem nenhuma política
-- que lho permitisse usar, o que dava zero linhas hoje e um problema no dia em que
-- alguém acrescentasse uma política sem olhar para os privilégios.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Write own school invoice events" ON public.finance_invoice_events;
DROP POLICY IF EXISTS "Write own school student status events" ON public.student_status_events;

REVOKE INSERT, UPDATE, DELETE ON public.finance_invoice_events FROM authenticated;
REVOKE ALL ON public.finance_invoice_events FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.student_status_events FROM authenticated;
REVOKE ALL ON public.student_status_events FROM anon;

-- ---------------------------------------------------------------------------
-- 4) Confirmar que o RLS continua activo nas quatro.
--    Sem RLS, a ausência de política deixa de negar seja o que for -- passa a
--    permitir tudo a quem tenha o privilégio.
-- ---------------------------------------------------------------------------
ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_events FORCE ROW LEVEL SECURITY;

GRANT ALL ON public.enrollment_applications TO service_role;
GRANT ALL ON public.enrollment_forms TO service_role;
GRANT ALL ON public.finance_invoice_events TO service_role;
GRANT ALL ON public.student_status_events TO service_role;
