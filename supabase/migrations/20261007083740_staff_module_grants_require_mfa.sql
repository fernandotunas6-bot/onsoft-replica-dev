-- PREPARADA, NÃO APLICADA. Conservar as políticas de âmbito/admin existentes.
-- RESTRICTIVE impede que políticas permissivas sem MFA anulem o requisito.
-- SELECT continua disponível em AAL1: separar restrições por comando.
DROP POLICY IF EXISTS staff_module_grants_write_aal2 ON public.staff_module_grants;
DROP POLICY IF EXISTS staff_module_grants_insert_aal2 ON public.staff_module_grants;
CREATE POLICY staff_module_grants_insert_aal2 ON public.staff_module_grants
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.is_aal2());
DROP POLICY IF EXISTS staff_module_grants_update_aal2 ON public.staff_module_grants;
CREATE POLICY staff_module_grants_update_aal2 ON public.staff_module_grants
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.is_aal2()) WITH CHECK (private.is_aal2());
DROP POLICY IF EXISTS staff_module_grants_delete_aal2 ON public.staff_module_grants;
CREATE POLICY staff_module_grants_delete_aal2 ON public.staff_module_grants
  AS RESTRICTIVE FOR DELETE TO authenticated USING (private.is_aal2());
