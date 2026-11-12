-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-27
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: tempo real dos avisos pessoais (`notifications`) para a app móvel.
-- Sem ela a app funciona e verifica os avisos de minuto a minuto; com ela, o
-- aviso chega ao segundo. Não alarga o acesso: o tempo real aplica a mesma
-- política de leitura que a API (cada conta só recebe os seus avisos). Não mexe
-- em dados.
-- Ensaiado em PGlite (tests/sql/realtime-notifications-package.mjs): o pacote
-- inteiro corre duas vezes seguidas sem erros.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261027100000_realtime_publish_notifications.sql ══════════
-- Tempo real: publicar os avisos pessoais (`notifications`) para a app móvel.
--
-- A app SIGA Plus (Android) mostra os avisos pessoais — trabalho novo ou
-- devolvido, avaliação marcada, pauta publicada, horário, lembretes, comunicados
-- da direcção — e subscreve INSERT em `notifications` com o filtro
-- `user_id=eq.<a própria conta>`. Sem esta publicação a app continua a funcionar:
-- verifica os avisos de minuto a minuto enquanto está aberta. Com ela, o aviso
-- chega ao segundo.
--
-- Publicar não alarga o acesso. Em INSERT e UPDATE, o tempo real entrega a cada
-- subscritor só as linhas que a política de leitura lhe deixa ler, como a API:
-- `notifications_select` só deixa ver as linhas da própria conta
-- (`user_id = auth.uid()`) nas escolas de que é membro. Em DELETE o Postgres não
-- consegue aplicar o RLS e o tempo real envia só a chave primária (o id), sem
-- conteúdo; os avisos não se apagam (lidos são UPDATE de `read_at`).
--
-- Idempotente: só acrescenta a tabela se existir e ainda não estiver publicada.
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
    'notifications'
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
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'notifications'
) THEN 'aplicada' ELSE 'por aplicar' END AS "20261027100000 tempo real dos avisos";
