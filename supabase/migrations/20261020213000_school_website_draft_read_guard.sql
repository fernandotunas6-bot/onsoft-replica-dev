-- SIGA School Sites v1 — proteger rascunhos do website no school_settings.
--
-- Conferido com o esquema SGA de produção (2026-10-20):
--   public.school_settings(id, school_id, domain, value, version, changed_by)
--   SELECT authenticated: settings_select_member (inclui aluno/encarregado)
--   INSERT authenticated: settings_insert_authorized (AAL2 + permissão)
--   private.has_permission(uuid, text) existe e é usado na política INSERT.
--
-- Antes desta política, qualquer membro da escola com SELECT em
-- school_settings podia ler o JSON draft do domínio school_website pela API
-- Supabase, mesmo que o website não estivesse publicado.
--
-- IMPORTANTE: não altera as restantes configurações, não publica qualquer
-- website, não aplica SQL em produção através do repositório e não reescreve
-- as políticas existentes. Requer rollout coordenado ANTES de activar
-- /configuracoes/site (consulte docs/school-sites/RUNBOOK.md).
--
-- Política RESTRICTIVE: combina por AND com settings_select_member.
-- Os membros mantêm acesso aos outros domínios, sem alteração de permissões.
-- Para school_website, a mesma autorização administrativa que permite INSERT
-- passa também a ser exigida para SELECT directo.
--
-- Idempotente: reexecutar não duplica políticas.
DROP POLICY IF EXISTS school_website_drafts_admin_read_guard ON public.school_settings;

CREATE POLICY school_website_drafts_admin_read_guard
  ON public.school_settings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    domain IS DISTINCT FROM 'school_website'
    OR private.has_permission(school_id, 'schools.settings.create')
  );

COMMENT ON POLICY school_website_drafts_admin_read_guard
  ON public.school_settings
  IS 'Rascunhos e versões school_website legíveis apenas a membros com permissão administrativa schools.settings.create; os outros domínios preservam o comportamento anterior.';

-- Não adicionar política permissiva: permitiria contornar a defesa por OR.
-- O endpoint público continua a expor APENAS o snapshot publicado via servidor.
