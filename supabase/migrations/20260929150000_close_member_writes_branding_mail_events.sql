-- Fecha escritas abertas a qualquer membro da escola.
--
-- Auditoria de 2026-09-29 às políticas de escrita em produção. Estas cinco
-- tabelas aceitavam escrita de qualquer conta com vínculo à escola — aluno ou
-- encarregado incluídos — porque a condição era só
-- `school_id = current_school_id()`:
--
--   * school_branding, mailboxes, school_email_routes (política ALL): um aluno
--     podia mudar o logótipo, as cores e o título do portal, ou as rotas de
--     e-mail da escola;
--   * finance_invoice_events, student_status_events (política INSERT): um
--     aluno podia forjar eventos de fatura ou de estado do aluno, que a
--     Tesouraria e a Secretaria lêem como históricos.
--
-- Nenhuma função da base escreve nelas e a aplicação só escreve com a chave de
-- serviço (`loadSgaAdminClient`). Ficam:
--   * mailboxes e school_email_routes: só o servidor (FORCE RLS + REVOKE);
--   * school_branding: leitura pública mantém-se (logótipo no ecrã de entrada),
--     escrita só o servidor;
--   * os dois históricos: leitura como estava (Tesouraria/Secretaria), escrita
--     só o servidor.
-- As tabelas estavam vazias em produção. Idempotente.

DROP POLICY IF EXISTS "platform_admin_all_mailboxes" ON public.mailboxes;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailboxes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.mailboxes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mailboxes TO service_role;

DROP POLICY IF EXISTS "platform_admin_all_email_routes" ON public.school_email_routes;
ALTER TABLE public.school_email_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_email_routes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_email_routes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.school_email_routes TO service_role;

DROP POLICY IF EXISTS "school_admin_manage_branding" ON public.school_branding;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.school_branding FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_branding TO anon, authenticated;
GRANT ALL ON public.school_branding TO service_role;

DROP POLICY IF EXISTS "Write own school invoice events" ON public.finance_invoice_events;
REVOKE ALL ON public.finance_invoice_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.finance_invoice_events FROM authenticated;
GRANT SELECT ON public.finance_invoice_events TO authenticated;
GRANT ALL ON public.finance_invoice_events TO service_role;

DROP POLICY IF EXISTS "Write own school student status events" ON public.student_status_events;
REVOKE ALL ON public.student_status_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.student_status_events FROM authenticated;
GRANT SELECT ON public.student_status_events TO authenticated;
GRANT ALL ON public.student_status_events TO service_role;
