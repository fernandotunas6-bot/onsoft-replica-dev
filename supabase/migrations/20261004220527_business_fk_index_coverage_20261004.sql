-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004220527).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá no mesmo dia.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- Indexa FKs de negócio sem índice de cobertura.
-- Exclui colunas de autoria (*_by, actor_user_id), consultadas apenas ao apagar utilizadores.
DO $$
DECLARE r record; cols text; colnames text; idx text;
BEGIN
  FOR r IN
    SELECT n.nspname s, t.relname tbl, c.conname, c.conrelid, c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname IN ('public','academic_evidence','private')
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
          AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] <@ c.conkey)
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord),
           string_agg(a.attname, '_' ORDER BY k.ord)
      INTO cols, colnames
    FROM unnest(r.conkey) WITH ORDINALITY k(n, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = k.n;

    CONTINUE WHEN colnames ~ '(_by|^actor_user_id)$' AND array_length(r.conkey,1) = 1;

    idx := left('ix_fk_' || r.tbl || '_' || colnames, 55) || '_' || substr(md5(r.conname), 1, 6);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)', idx, r.s, r.tbl, cols);
  END LOOP;
END $$;
