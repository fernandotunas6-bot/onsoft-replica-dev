-- =============================================================================
-- SIGA — Storage multi-school scope hardening
-- Date: 2026-09-06
-- Avoid current_school_id() in Storage authorization because it resolves the
-- first active membership, which is ambiguous for users belonging to >1 school.
-- =============================================================================

-- School logos remain publicly readable, but writes require settings permission
-- for the UUID tenant encoded in the first path segment.
DROP POLICY IF EXISTS "Authenticated users can upload school logos" ON storage.objects;
CREATE POLICY "Authorized users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_school_permission(split_part(name, '/', 1)::uuid, 'school.settings.update')
    AND name ~* '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
  );

DROP POLICY IF EXISTS "Authenticated users can replace school logos" ON storage.objects;
CREATE POLICY "Authorized users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_school_permission(split_part(name, '/', 1)::uuid, 'school.settings.update')
  )
  WITH CHECK (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_school_permission(split_part(name, '/', 1)::uuid, 'school.settings.update')
    AND name ~* '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
  );

-- Private SIGA files: tenant comes from path, while permissions decide the action.
DROP POLICY IF EXISTS "Staff can read siga files" ON storage.objects;
CREATE POLICY "Authorized users can read siga files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.read')
  );

DROP POLICY IF EXISTS "Staff can upload siga files" ON storage.objects;
CREATE POLICY "Authorized users can upload own siga files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.upload')
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Staff can replace siga files" ON storage.objects;
CREATE POLICY "Authorized users can replace siga files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.manage_system')
      OR (
        public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.upload')
        AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.manage_system')
      OR (
        public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.upload')
        AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
      )
    )
  );

DROP POLICY IF EXISTS "Staff can delete siga files" ON storage.objects;
CREATE POLICY "Authorized users can delete siga files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.manage_system')
      OR (
        public.has_school_permission(split_part(name, '/', 1)::uuid, 'files.delete')
        AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
      )
    )
  );

-- current_school_id() may remain for legacy UI lookups, but no sensitive Storage
-- authorization should depend on its first-membership semantics.
