-- school_settings ficava apenas em supabase/APPLY_IN_SQL_EDITOR.sql (script manual,
-- fora do fluxo de migrations versionado) apesar de já ser usada extensivamente em
-- produção: src/features/school/server.ts, src/features/documents/server.ts,
-- src/features/spotlight/server.ts, src/features/saas/school-bootstrap.ts,
-- src/features/finance/server.ts, src/features/academic/server-legacy.ts, e o
-- fluxo de e-mails institucionais (src/features/auth/reset-password-server.ts).
--
-- A forma abaixo foi **lida do catálogo da produção** a 2026-10-21 (consulta
-- só-leitura a information_schema e pg_catalog), não reconstruída a partir do
-- TypeScript. A primeira versão deste ficheiro foi escrita a partir do uso e
-- divergia em sete pontos, sendo o mais relevante a restrição de unicidade:
-- declarava `UNIQUE (school_id, domain)`, e a produção tem
-- `UNIQUE (school_id, domain, version)`. Como `CREATE TABLE IF NOT EXISTS` não
-- altera uma tabela existente, a divergência nunca se corrigia sozinha — vivia
-- no ficheiro e enganava quem desenhasse a partir dele.

CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sem ON DELETE CASCADE: a produção não o tem. Apagar uma escola com
  -- definições falha na chave estrangeira, em vez de as levar atrás.
  school_id uuid NOT NULL REFERENCES public.schools(id),
  domain text NOT NULL,
  -- `version` e `value` não têm omissão na produção: quem escreve indica sempre
  -- as duas. `changed_by` é obrigatório — a autoria de cada alteração não é
  -- opcional.
  version integer NOT NULL CHECK (version > 0),
  value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A restrição é sobre o trio: a tabela **aceita** várias versões do mesmo
  -- domínio. Mas nenhuma escrita as usa — a 2026-10-21, em 55 registos, nenhum
  -- domínio tem mais linhas do que escolas, e o `version` sobe na própria linha
  -- (onze vezes no print_templates). O convénio a correr é o do
  -- `updateSettingsDomainValue`: UPDATE da linha única com `version` como trava
  -- optimista, e `readSettingsRow` a ler com `.maybeSingle()`, que tolera zero
  -- ou uma linha — não duas. Ver tests/sql/school-settings-row-convention.mjs.
  UNIQUE (school_id, domain, version)
);

-- O índice que a produção tem. A primeira versão deste ficheiro declarava
-- `school_settings_school_id_idx (school_id)`, que não existe na base; este é
-- usado pela sonda de prontidão em 20260908210000_capture_all_db_functions.sql.
CREATE INDEX IF NOT EXISTS school_settings_school_domain_idx
  ON public.school_settings (school_id, domain, version DESC);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings FORCE ROW LEVEL SECURITY;

-- As políticas que a produção tem hoje — `settings_select_member`,
-- `settings_insert_authorized` e a restritiva `school_web_content_server_only`
-- (esta última declarada em 20261021051004) — dependem de `private.is_aal2()`,
-- `private.has_permission()` e `private.user_member_school_ids()`, que não
-- existem neste ponto da sequência. Não são declaradas aqui.
--
-- A primeira versão deste ficheiro criava três políticas («School members can
-- read own settings», «School admins can update own settings», «School admins
-- can insert own settings») que **não existem na produção**. Foram retiradas:
-- reaplicar este ficheiro criava-as por cima das reais.
--
-- Privilégios efectivos na produção, a 2026-10-21: anon nada; authenticated
-- SELECT e INSERT; service_role SELECT, INSERT e UPDATE. Não há GRANT explícito
-- nesta tabela — vêm por herança de papel — por isso também não se declaram.
