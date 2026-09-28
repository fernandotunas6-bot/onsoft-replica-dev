-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-28 (1.º)
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: salários (contratos, vínculos, folhas, alterações salariais) e
-- históricos (faturas, estado dos alunos) deixam de estar à vista de alunos
-- e encarregados. Não mexe em dados; os ecrãs não mudam.
-- Testado em 2026-09-28 num Postgres 16 com as políticas actuais da
-- produção: antes o aluno lia a folha de salários; depois só a Tesouraria e a
-- Administração a lêem, e o histórico de estado dos alunos só a Secretaria e a
-- Administração. Duas corridas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260928090000_payroll_history_read_by_school_role.sql ══════════
-- Salários e históricos deixam de estar à vista de qualquer membro da escola.
--
-- As políticas de leitura destas tabelas só exigiam pertencer à escola
-- (`is_school_member` ou a escola actual do perfil) — o que inclui alunos e
-- encarregados. Com a chave pública, um aluno lia contratos, vínculos, folhas
-- de salário e alterações salariais de todos os funcionários, o histórico de
-- todas as faturas e o histórico de estado de todos os alunos.
--
-- Fica, pelo papel NA escola (inscrição e papéis, não o papel do perfil):
--   * RH e folha de salários: Administrador ou Tesouraria — os mesmos papéis
--     que as funções da folha (hr_create/calculate/approve_payroll_run, lotes
--     de pagamento) já exigem; elas correm com a sessão e continuam a ler.
--   * histórico das faturas: Administrador, Secretaria ou Tesouraria.
--   * histórico de estado dos alunos: Administrador ou Secretaria.
-- A aplicação lê estas tabelas pelo servidor; nada muda nos ecrãs.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.is_school_office(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(r.code) IN ('owner', 'admin', 'administrador', 'secretary', 'secretaria')
  );
$$;
REVOKE ALL ON FUNCTION public.is_school_office(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_office(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_school_finance(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(r.code) IN ('owner', 'admin', 'administrador', 'treasury', 'tesouraria', 'finance')
  );
$$;
REVOKE ALL ON FUNCTION public.is_school_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_finance(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Read own school invoice events" ON public.finance_invoice_events;
CREATE POLICY "Read own school invoice events" ON public.finance_invoice_events
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id))) AND (public.is_school_finance(school_id) OR public.is_school_office(school_id)));

DROP POLICY IF EXISTS "Read hr_compensation_events in own school" ON public.hr_compensation_events;
CREATE POLICY "Read hr_compensation_events in own school" ON public.hr_compensation_events
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read hr_contracts in own school" ON public.hr_contracts;
CREATE POLICY "Read hr_contracts in own school" ON public.hr_contracts
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read hr_employments in own school" ON public.hr_employments;
CREATE POLICY "Read hr_employments in own school" ON public.hr_employments
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read hr_payroll_item_components in own school" ON public.hr_payroll_item_components;
CREATE POLICY "Read hr_payroll_item_components in own school" ON public.hr_payroll_item_components
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read hr_payroll_items in own school" ON public.hr_payroll_items;
CREATE POLICY "Read hr_payroll_items in own school" ON public.hr_payroll_items
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read hr_payroll_runs in own school" ON public.hr_payroll_runs;
CREATE POLICY "Read hr_payroll_runs in own school" ON public.hr_payroll_runs
  FOR SELECT TO authenticated
  USING (public.is_school_finance(school_id));

DROP POLICY IF EXISTS "Read own school student status events" ON public.student_status_events;
CREATE POLICY "Read own school student status events" ON public.student_status_events
  FOR SELECT TO authenticated
  USING (((school_id = ( SELECT current_school_id() AS current_school_id))) AND public.is_school_office(school_id));


-- ══════════ Confirmação ══════════
SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND cmd = 'SELECT'
    AND tablename IN ('hr_contracts', 'hr_employments', 'hr_payroll_items', 'hr_payroll_item_components',
                      'hr_payroll_runs', 'hr_compensation_events', 'finance_invoice_events', 'student_status_events')
    AND coalesce(qual, '') NOT LIKE '%is_school_finance%' AND coalesce(qual, '') NOT LIKE '%is_school_office%'
) THEN 'aplicada' ELSE 'por aplicar' END AS salarios_e_historicos_por_papel;
