-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004221507).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá no mesmo dia.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- Auditoria de role_permissions por instrução (1 registo por escola+perfil+operação),
-- com as permissões exactas afectadas. Substitui o trigger por linha, que gerava
-- milhares de registos sem identificar o perfil nem a permissão.
CREATE OR REPLACE FUNCTION private.audit_role_permissions_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
    SELECT n.school_id, v_actor,
           'role_permissions.' || lower(TG_OP), 'roles', n.role_id,
           jsonb_build_object(
             'operation', lower(TG_OP),
             'granularity', 'statement',
             'permission_count', count(*),
             'permission_ids', jsonb_agg(n.permission_id ORDER BY n.permission_id),
             'permission_codes', jsonb_agg(p.code ORDER BY n.permission_id))
    FROM new_rows n
    LEFT JOIN public.permissions p ON p.id = n.permission_id
    GROUP BY n.school_id, n.role_id;
  END IF;

  IF TG_OP IN ('DELETE','UPDATE') THEN
    INSERT INTO public.audit_logs (school_id, actor_user_id, action, entity_type, entity_id, metadata)
    SELECT o.school_id, v_actor,
           'role_permissions.' || CASE WHEN TG_OP = 'UPDATE' THEN 'update_old' ELSE 'delete' END,
           'roles', o.role_id,
           jsonb_build_object(
             'operation', lower(TG_OP),
             'granularity', 'statement',
             'permission_count', count(*),
             'permission_ids', jsonb_agg(o.permission_id ORDER BY o.permission_id),
             'permission_codes', jsonb_agg(p.code ORDER BY o.permission_id))
    FROM old_rows o
    LEFT JOIN public.permissions p ON p.id = o.permission_id
    GROUP BY o.school_id, o.role_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_role_permissions_stmt() FROM PUBLIC, anon, authenticated;

DROP TRIGGER audit_role_permissions_change ON public.role_permissions;

CREATE TRIGGER audit_role_permissions_insert
  AFTER INSERT ON public.role_permissions
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.audit_role_permissions_stmt();

CREATE TRIGGER audit_role_permissions_delete
  AFTER DELETE ON public.role_permissions
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.audit_role_permissions_stmt();

CREATE TRIGGER audit_role_permissions_update
  AFTER UPDATE ON public.role_permissions
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.audit_role_permissions_stmt();
