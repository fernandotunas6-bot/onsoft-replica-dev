-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-28 (3.º) — APLICADO à produção a 2026-09-28 (conector do Supabase).
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração (Storage): o arquivo da escola (bucket siga-files: recibos,
-- documentos, fotografias) deixa de ser legível por qualquer membro — cada um
-- lê só o que ele próprio enviou; a aplicação continua a mostrar tudo pelo
-- servidor. Logótipos: só Administração/Secretaria e sem SVG; o envio pelo
-- ecrã de identidade (pasta do tenant), hoje recusado, passa a funcionar.
-- Não mexe em ficheiros.
-- Testado em 2026-09-28 num Postgres 16 com as políticas do script
-- APPLY_ENROLLMENT_AND_PREMIUM.sql: aluno lia 1 ficheiro do arquivo e enviava
-- SVG; depois 0 e recusado. Duas corridas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260928130000_storage_files_logos_hardening.sql ══════════
-- Armazenamento: o arquivo da escola deixa de estar à vista de qualquer membro,
-- e os logótipos só são enviados pela Administração/Secretaria.
--
-- `siga-files` (privado) guarda o arquivo da escola: recibos e despesas
-- arquivados, documentos, fotografias. A política "Staff can read siga files"
-- só verificava a escola actual do utilizador — alunos e encarregados liam
-- tudo pela API de Storage. A aplicação lê estes ficheiros pelo servidor
-- (URLs assinadas de curta duração) e o navegador só ENVIA para a pasta do
-- próprio utilizador. Fica:
--   * leitura directa só dos ficheiros que a própria pessoa enviou (a pasta
--     com o seu id, a mesma regra do envio);
--   * sem apagar pelo cliente (a aplicação não o faz).
--
-- `school-logos` (público) aceitava envios de qualquer membro da escola, e
-- SVG (imagem que pode levar código, servida publicamente). Fica: só
-- Administrador/Secretaria da escola (papel na própria escola) e só
-- PNG/JPEG/WebP. A pasta pode ser o id da escola ou do tenant (os dois ecrãs
-- de definições usam um e outro).
--
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

-- Pasta de logótipo válida para a escola actual do utilizador: o id da escola
-- ou o do seu tenant.
CREATE OR REPLACE FUNCTION public.school_logo_folder_ok(p_folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.id = (SELECT public.current_school_id())
      AND public.is_school_office(s.id)
      AND p_folder IN (s.id::text, coalesce(s.tenant_id::text, ''))
  );
$$;
REVOKE ALL ON FUNCTION public.school_logo_folder_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_logo_folder_ok(text) TO authenticated, service_role;

-- ── siga-files ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can read siga files" ON storage.objects;
DROP POLICY IF EXISTS "Owners read own siga files" ON storage.objects;
CREATE POLICY "Owners read own siga files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  );
DROP POLICY IF EXISTS "Staff can delete siga files" ON storage.objects;

-- ── school-logos ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload school logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp)$'
    AND public.school_logo_folder_ok(split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "Authenticated users can replace school logos" ON storage.objects;
CREATE POLICY "Authenticated users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp)$'
    AND public.school_logo_folder_ok(split_part(name, '/', 1))
  )
  WITH CHECK (
    bucket_id = 'school-logos'
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp)$'
    AND public.school_logo_folder_ok(split_part(name, '/', 1))
  );


-- ══════════ Confirmação ══════════
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Owners read own siga files')
            AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname IN ('Staff can read siga files', 'Staff can delete siga files'))
            AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE '%school logos%' AND coalesce(with_check, qual, '') LIKE '%svg%')
       THEN 'aplicada' ELSE 'por aplicar' END AS arquivo_e_logotipos;
