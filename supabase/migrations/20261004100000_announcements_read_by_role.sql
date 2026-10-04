-- Comunicados: alunos e encarregados só lêem os enviados e não os do corpo docente.
--
-- Achado a 2026-10-04 (produção, só leitura): a única política de leitura de
-- school_announcements é «Read school announcements»:
--   is_school_member(school_id) AND deleted_at IS NULL
-- is_school_member é verdadeiro para alunos e encarregados (DATABASE_RULES.md,
-- regra 4). Pela API, e pelo tempo real (a tabela está na publicação
-- supabase_realtime), recebiam rascunhos, agendados e avisos ao corpo docente
-- que a lista do servidor lhes esconde (src/features/communications/server.ts:
-- quem não é Administrador/Secretaria/Professor só vê status 'sent' e
-- audience <> 'teaching_staff').
--
-- Correcção: uma política RESTRICTIVE, como em
-- 20260930130000_sensitive_tables_school_staff_only.sql. Combina-se por AND com
-- a permissiva existente, que fica como está. O pessoal
-- (private.is_school_staff: Administrador/Secretaria/Tesouraria/Professor) lê
-- todos; os outros membros só os enviados e não os do corpo docente. status e
-- audience são NOT NULL na produção. O servidor usa a chave de serviço
-- (BYPASSRLS) e não é afectado; o tempo real aplica as mesmas políticas.
--
-- Idempotente: DROP POLICY IF EXISTS antes do CREATE; tabela ausente é saltada.
-- Não apaga dados.

DO $announcements$
BEGIN
  IF to_regclass('public.school_announcements') IS NULL THEN
    RAISE NOTICE 'school_announcements não existe: nada a fazer.';
    RETURN;
  END IF;
  IF to_regprocedure('private.is_school_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'private.is_school_staff(uuid) não existe: aplicar primeiro 20260930130000_sensitive_tables_school_staff_only.sql';
  END IF;

  DROP POLICY IF EXISTS "Announcements visible by role" ON public.school_announcements;
  CREATE POLICY "Announcements visible by role" ON public.school_announcements
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (
      private.is_school_staff(school_id)
      OR (status = 'sent' AND audience <> 'teaching_staff')
    );
END
$announcements$;
