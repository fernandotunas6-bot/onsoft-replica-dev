-- Dinheiro: escrever na folha salarial, contratos, pagamentos e faturação exige 2FA.
--
-- Até aqui, com a senha de um Administrador ou da Tesouraria e sem 2FA, a API
-- REST criava, aprovava e autorizava folhas e lotes de pagamento, e mudava
-- contratos, remunerações e destinos de pagamento: as políticas destas tabelas
-- só pediam o papel, e as funções da folha (hr_create/calculate/approve_payroll_run,
-- hr_create/refresh/authorize_payroll_payment_batch, …) são SECURITY INVOKER e não
-- verificam 2FA. No servidor da app só «destino de pagamento» e «confirmar
-- pagamento» o exigiam.
--
-- Decisão do dono (2026-09-30): exigir 2FA na base só para o que mexe em
-- dinheiro. Estrutura académica, RH não financeiro (departamentos, cargos,
-- vínculos) e presenças/QR dos professores ficam como estão.
--
-- Três políticas RESTRICTIVE por tabela (INSERT, UPDATE, DELETE) com
-- private.is_aal2(): somam-se por AND às existentes, que continuam a decidir o
-- papel e a escola. A leitura não muda. O servidor com a chave de serviço
-- (BYPASSRLS) não é afectado; hr_redeem_teacher_qr é SECURITY DEFINER e também
-- não. As funções INVOKER da folha passam a exigir aal2 a quem as chama.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE; tabelas ausentes
-- são saltadas.

DO $mfa$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_contracts',
    'hr_contract_remuneration_policies',
    'hr_compensation_events',
    'hr_absence_events',
    'hr_payroll_runs',
    'hr_payroll_items',
    'hr_payroll_item_components',
    'hr_payroll_payment_batches',
    'hr_payroll_payment_items',
    'hr_payment_destinations',
    'hr_payment_settings',
    'school_billing_settings'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe; saltada.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Money writes require MFA (insert)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Money writes require MFA (update)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Money writes require MFA (delete)" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Money writes require MFA (insert)" ON public.%I AS RESTRICTIVE '
      'FOR INSERT TO authenticated WITH CHECK (private.is_aal2())', t);
    EXECUTE format(
      'CREATE POLICY "Money writes require MFA (update)" ON public.%I AS RESTRICTIVE '
      'FOR UPDATE TO authenticated USING (private.is_aal2()) WITH CHECK (private.is_aal2())', t);
    EXECUTE format(
      'CREATE POLICY "Money writes require MFA (delete)" ON public.%I AS RESTRICTIVE '
      'FOR DELETE TO authenticated USING (private.is_aal2())', t);
  END LOOP;
END
$mfa$;
