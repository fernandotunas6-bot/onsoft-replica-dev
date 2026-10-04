-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004220648).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá no mesmo dia.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- Funde políticas permissivas duplicadas (legado + RBAC) numa única política SELECT por tabela.
-- Semântica preservada: políticas permissivas combinam-se por OR; políticas ALL são
-- desdobradas em INSERT/UPDATE/DELETE com as mesmas expressões.
DO $$
DECLARE
  t text; sel text; p record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_policies
    WHERE schemaname='public' AND permissive='PERMISSIVE' AND roles = '{authenticated}'
      AND cmd IN ('SELECT','ALL')
    GROUP BY tablename HAVING count(*) > 1
  LOOP
    -- Segurança: só transformar se todas as políticas relevantes forem exclusivamente de authenticated
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
               AND cmd IN ('SELECT','ALL') AND roles <> '{authenticated}') THEN
      RAISE NOTICE 'skip %', t; CONTINUE;
    END IF;

    SELECT string_agg('(' || qual || ')', ' OR ' ORDER BY policyname) INTO sel
    FROM pg_policies WHERE schemaname='public' AND tablename=t
      AND permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL');

    FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=t
             AND permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL') LOOP
      IF p.cmd = 'ALL' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
          left(p.policyname,50)||' (insert)', t, coalesce(p.with_check, p.qual));
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
          left(p.policyname,50)||' (update)', t, p.qual, coalesce(p.with_check, p.qual));
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
          left(p.policyname,50)||' (delete)', t, p.qual);
      END IF;
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_read', t, sel);
  END LOOP;
END $$;
