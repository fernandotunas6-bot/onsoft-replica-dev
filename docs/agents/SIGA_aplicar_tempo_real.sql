-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-04
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: tempo real. Publica as 6 tabelas que os ecrãs já subscrevem
-- (mensagens e notificações do desktop, /alunos, painel, /faturas) e que nunca
-- recebiam nada. Não alarga o acesso: o tempo real aplica as mesmas políticas de
-- leitura que a API. Não mexe em dados.
-- Verificado a 2026-10-04 na produção (só leitura): a publicação só tinha
-- document_requests, school_announcements, siga_chat_members e siga_chat_messages.
-- Ensaiado em PGlite (tests/sql/realtime-package.mjs): o pacote inteiro corre
-- duas vezes seguidas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


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
SELECT CASE WHEN (
  SELECT count(*) FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename IN ('siga_direct_messages', 'students', 'enrollments',
                       'enrollment_applications', 'finance_invoices', 'finance_receipts')
) = 6 THEN 'aplicada' ELSE 'por aplicar' END AS "20261004101000 tempo real";
