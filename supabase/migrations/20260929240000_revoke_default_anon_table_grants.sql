-- Visitantes sem sessão (`anon`): só o que as políticas públicas usam.
--
-- As permissões por omissão do Supabase davam ao `anon` SELECT, INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES e TRIGGER em cerca de 83 tabelas de `public`
-- (incluindo platform_admins, hr_payroll_items, person_documents,
-- verification_otps, siga_direct_messages). O RLS recusava tudo, porque só 4
-- políticas se aplicam a `anon`; mas bastava uma política demasiado larga no
-- futuro para expor a tabela a quem não tem sessão, e o TRUNCATE nem passa
-- pelo RLS.
--
-- Ficam só as permissões que essas 4 políticas usam:
--   enrollment_forms          SELECT  (formulários de matrícula abertos)
--   enrollment_applications   INSERT  (candidatura pública)
--   reserved_subdomains       SELECT
--   school_branding           SELECT  (marca no ecrã de entrada)
--
-- Tabela nova que precise de acesso sem sessão: GRANT explícito a `anon` na
-- mesma migração da política. Idempotente. Não mexe em `authenticated` nem em
-- `service_role`.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
  END LOOP;
END $$;

GRANT SELECT ON public.enrollment_forms TO anon;
GRANT INSERT ON public.enrollment_applications TO anon;
GRANT SELECT ON public.reserved_subdomains TO anon;
GRANT SELECT ON public.school_branding TO anon;
