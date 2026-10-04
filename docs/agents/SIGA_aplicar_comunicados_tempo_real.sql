-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-04
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 2 migrações:
--   · comunicados: alunos e encarregados passam a ler só os enviados e não os do
--     corpo docente (política RESTRICTIVE); o pessoal continua a ler todos;
--   · tempo real: publica as 6 tabelas que os ecrãs já subscrevem (mensagens e
--     notificações do desktop, /alunos, painel, /faturas). Não alarga o acesso:
--     o tempo real aplica as mesmas políticas de leitura que a API.
-- Não mexe em dados. A 2026-10-04 (produção, só leitura) as 2 linhas de
-- school_announcements estavam enviadas e não eram do corpo docente: nada
-- exposto ainda; sem isto, o primeiro rascunho já seria lido por alunos e
-- encarregados.
-- Ensaiado em PGlite (tests/sql/announcements-rls.mjs): o pacote inteiro corre
-- duas vezes seguidas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada" nas duas).


-- ══════════ 20261004100000_announcements_read_by_role.sql ══════════
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


-- ══════════ 20261004101000_realtime_publish_school_screens.sql ══════════
-- Tempo real: publicar as tabelas que os ecrãs do SIGA já subscrevem.
--
-- Achado a 2026-10-04 (produção, só leitura): a publicação supabase_realtime só
-- tem document_requests, school_announcements, siga_chat_members e
-- siga_chat_messages. Os ecrãs subscrevem também, e nunca recebiam nada:
--   · siga_direct_messages — mensagens, contador de não-lidas e as notificações
--     do desktop (features/messages, DesktopNotifications);
--   · students, enrollments, enrollment_applications, finance_invoices,
--     finance_receipts — /alunos, painel e /faturas.
-- A migração 20260901091600_enable_app_realtime.sql tentava publicar
-- `invoices` e `payments`, que não existem no SIGA (DATABASE_RULES.md): o bloco
-- falha por inteiro e não publica nada.
--
-- Publicar não alarga o acesso. Em INSERT e UPDATE, o tempo real entrega a cada
-- subscritor só as linhas que as políticas de leitura lhe deixam ler, como a API:
-- students, finance_invoices e finance_receipts têm a RESTRICTIVE «School staff
-- only»; enrollment_applications só a secretaria; siga_direct_messages só o
-- remetente e o destinatário. Em DELETE o Postgres não consegue aplicar o RLS e o
-- tempo real envia só a chave primária (o id), sem conteúdo; estas tabelas quase
-- não apagam linhas (anulações são UPDATE).
--
-- Idempotente: só acrescenta as tabelas que existem e ainda não estão publicadas.
-- Não apaga dados.

DO $realtime$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publicação supabase_realtime inexistente: nada a fazer.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'siga_direct_messages',
    'students',
    'enrollments',
    'enrollment_applications',
    'finance_invoices',
    'finance_receipts'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% não existe: saltada.', t;
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$realtime$;


-- ══════════ Confirmar ══════════
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'school_announcements'
       AND policyname = 'Announcements visible by role'
       AND permissive = 'RESTRICTIVE'
  ) THEN 'aplicada' ELSE 'por aplicar' END AS "20261004100000 comunicados por papel",
  CASE WHEN (
    SELECT count(*) FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename IN ('siga_direct_messages', 'students', 'enrollments',
                         'enrollment_applications', 'finance_invoices', 'finance_receipts')
  ) = 6 THEN 'aplicada' ELSE 'por aplicar' END AS "20261004101000 tempo real";
