-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004220739).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá no mesmo dia.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- staff_module_grants: uma política por comando (mesma semântica, OR das anteriores)
DROP POLICY "Admins manage staff grants (insert)" ON public.staff_module_grants;
DROP POLICY staff_module_grants_insert_admin ON public.staff_module_grants;
CREATE POLICY staff_module_grants_insert ON public.staff_module_grants FOR INSERT TO authenticated
  WITH CHECK (is_school_admin(school_id) OR (is_school_member(school_id) AND private.sga_app_role(school_id) = 'Administrador'));

DROP POLICY "Admins manage staff grants (update)" ON public.staff_module_grants;
DROP POLICY staff_module_grants_update_admin ON public.staff_module_grants;
CREATE POLICY staff_module_grants_update ON public.staff_module_grants FOR UPDATE TO authenticated
  USING (is_school_admin(school_id) OR (is_school_member(school_id) AND private.sga_app_role(school_id) = 'Administrador'))
  WITH CHECK (is_school_admin(school_id) OR (is_school_member(school_id) AND private.sga_app_role(school_id) = 'Administrador'));

DROP POLICY "Admins manage staff grants (delete)" ON public.staff_module_grants;
DROP POLICY staff_module_grants_delete_admin ON public.staff_module_grants;
CREATE POLICY staff_module_grants_delete ON public.staff_module_grants FOR DELETE TO authenticated
  USING (is_school_admin(school_id) OR (is_school_member(school_id) AND private.sga_app_role(school_id) = 'Administrador'));

-- Simplificar a política SELECT (termos repetidos)
ALTER POLICY staff_module_grants_read ON public.staff_module_grants
  USING (is_school_admin(school_id)
         OR (is_school_member(school_id) AND (user_id = (SELECT auth.uid()) OR private.sga_app_role(school_id) = 'Administrador')));

-- reserved_subdomains: leitura já é pública; a política de admin passa a cobrir só escrita
DROP POLICY platform_admin_manage_reserved_subdomains ON public.reserved_subdomains;
CREATE POLICY reserved_subdomains_admin_insert ON public.reserved_subdomains FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY reserved_subdomains_admin_update ON public.reserved_subdomains FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY reserved_subdomains_admin_delete ON public.reserved_subdomains FOR DELETE TO authenticated USING (is_platform_admin());
