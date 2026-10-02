-- Achado P1 (docs/auditoria/02-auditoria.md, 2.1): assistente de instalação de oito
-- funções em `private.*` com invólucro público em `public.*` (16 no total) --
-- configure_school_identity_campus, configure_academic_structure, configure_financial_plan,
-- configure_assessment_rules, configure_default_modules, configure_school_owner,
-- finalize_installation, installer_database_health.
--
-- Nenhuma delas funciona: todas escrevem progresso em `public.installation_runs`, que
-- não existe (`to_regclass('public.installation_runs')` devolve NULL; confirmado ao vivo
-- em 2026-09-24 -- qualquer chamada falharia com "relation does not exist"). E nenhuma é
-- chamada pela aplicação -- zero referências em `src/` a qualquer uma delas.
--
-- O caminho real que cria escolas é outro (`features/saas/school-bootstrap.ts`,
-- `public-signup.ts`, coberto por tests/saas/school-bootstrap.test.ts e
-- public-signup.test.ts). Este assistente é peso morto que aparenta ser a via oficial --
-- confunde quem ler o esquema à procura de "como se cria uma escola", e não pode nunca
-- ter funcionado em produção.
--
-- Remove as 16 (8 wrappers públicos + 8 implementações privadas). Nada na aplicação as
-- invoca, logo isto não muda comportamento nenhum -- só tira do esquema uma via que
-- nunca esteve viva.

BEGIN;

DROP FUNCTION IF EXISTS public.configure_school_identity_campus(uuid, text, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.configure_academic_structure(uuid, text[], text, text, text, text, text, date, date, text, numeric, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.configure_financial_plan(uuid, numeric, numeric, integer, text, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.configure_assessment_rules(uuid, numeric, numeric, numeric, numeric, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.configure_default_modules(uuid, text[]);
DROP FUNCTION IF EXISTS public.configure_school_owner(uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.finalize_installation(uuid, boolean);
DROP FUNCTION IF EXISTS public.installer_database_health(uuid);

DROP FUNCTION IF EXISTS private.configure_school_identity_campus(uuid, text, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS private.configure_academic_structure(uuid, text[], text, text, text, text, text, date, date, text, numeric, numeric, numeric, smallint);
DROP FUNCTION IF EXISTS private.configure_financial_plan(uuid, numeric, numeric, smallint, text, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS private.configure_assessment_rules(uuid, numeric, numeric, numeric, numeric, text, boolean, boolean);
DROP FUNCTION IF EXISTS private.configure_default_modules(uuid, text[]);
DROP FUNCTION IF EXISTS private.configure_school_owner(uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS private.finalize_installation(uuid, boolean);
DROP FUNCTION IF EXISTS private.installer_database_health(uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';
