-- school_settings ficava apenas em supabase/APPLY_IN_SQL_EDITOR.sql (script manual,
-- fora do fluxo de migrations versionado) apesar de já ser usada extensivamente em
-- produção: src/features/school/server.ts, src/features/documents/server.ts,
-- src/features/spotlight/server.ts, src/features/saas/school-bootstrap.ts,
-- src/features/finance/server.ts, src/features/academic/server-legacy.ts, e o
-- fluxo de e-mails institucionais (src/features/auth/reset-password-server.ts).
--
-- Schema confirmado pelo uso real (não pelo script manual, que não define DDL
-- desta tabela): `version` (integer, incrementado manualmente pela aplicação a
-- cada UPDATE) e `changed_by` (não `updated_by`/trigger automática — a
-- primeira versão desta migration inventou essas colunas sem checar o uso
-- real e teria quebrado school/server.ts, spotlight/server.ts, etc. com
-- "column does not exist" em qualquer ambiente aplicado do zero).

CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  domain text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Sem `updated_at`: esta tabela guarda versões, não o estado actual. Cada
  -- alteração acrescenta uma linha com `version` mais alto e o seu `changed_by`;
  -- uma linha nunca é editada, logo não há o que actualizar. A declaração tinha
  -- a coluna e a produção não, e como `CREATE TABLE IF NOT EXISTS` não altera
  -- uma tabela existente, a divergência nunca se resolveria por aqui.
  UNIQUE (school_id, domain)
);

CREATE INDEX IF NOT EXISTS school_settings_school_id_idx
  ON public.school_settings (school_id);

GRANT SELECT ON public.school_settings TO authenticated;
GRANT ALL ON public.school_settings TO service_role;

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings FORCE ROW LEVEL SECURITY;

-- Nota: toda a escrita hoje passa por loadSgaAdminClient() (service_role, que
-- ignora RLS) — nenhum destes fluxos de aplicação depende destas policies de
-- INSERT/UPDATE. Ficam como defesa em profundidade caso algum acesso futuro
-- use um client autenticado como utilizador em vez do admin.
DROP POLICY IF EXISTS "School members can read own settings" ON public.school_settings;
CREATE POLICY "School members can read own settings"
  ON public.school_settings FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "School admins can update own settings" ON public.school_settings;
CREATE POLICY "School admins can update own settings"
  ON public.school_settings FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );

DROP POLICY IF EXISTS "School admins can insert own settings" ON public.school_settings;
CREATE POLICY "School admins can insert own settings"
  ON public.school_settings FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );

COMMENT ON TABLE public.school_settings IS
  'Configurações por domínio/escola (JSON em value), versionadas manualmente pela aplicação (version + changed_by, sem trigger). Domínios conhecidos: branding (logo_url, primary_color), banking, agt, spotlight, pedagogy, academic, school (finance), documents. Acesso restrito à própria escola via current_school_id().';
