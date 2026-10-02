-- Reconciliar `school_access_requests` com o esquema que o código espera.
--
-- A tabela existe na produção com nomes de coluna diferentes dos que
-- `src/features/access/requests-server.ts` grava e lê. O pedido de acesso a uma
-- escola nunca funcionou, e não há nada nos registos que o diga.
--
-- Como se chegou aqui, porque importa para não repetir: uma versão inicial da
-- tabela foi aplicada à mão (ver `docs/agents/CONTINUE.md`, 2026-09-25). A
-- migração `20260925090000_school_access_requests.sql` foi depois reescrita com
-- outros nomes -- `institutional_number` em vez de `institutional_id`,
-- `requested_profile` em vez de `requested_role`, e mais sete colunas novas. Essa
-- migração abre com `CREATE TABLE IF NOT EXISTS`, que sobre uma tabela existente
-- não faz nada e não devolve erro. Correu, foi saltada, e ninguém soube.
--
-- A prova de que correu está nos índices: a produção tem HOJE os três índices da
-- migração nova (`school_access_requests_open_uidx`, `_school_status_idx`,
-- `_user_idx`) ao lado dos três da versão antiga (`_one_open`, `_school_status`,
-- `_user`). Os índices criaram-se porque só tocam em colunas que as duas versões
-- partilham; a tabela não mudou porque o `IF NOT EXISTS` a protegeu. Seis índices
-- onde deviam estar três é o rasto do mesmo acidente.
--
-- Há ainda uma segunda definição da mesma tabela no repositório, com a forma
-- ANTIGA: `20260925120220_capture_undeclared_production_tables.sql`, gerada por
-- captura do catálogo. Duas migrações a declarar a mesma tabela de formas
-- diferentes, ambas com `IF NOT EXISTS`, e a captura com carimbo mais recente.
-- Qualquer uma que corra primeiro ganha, em silêncio. Esta migração resolve o
-- estado; a duplicação em si fica anotada em `docs/agents/DATABASE_RULES.md`.
--
-- Porque é `ALTER` e não `DROP`+`CREATE`: a tabela está vazia hoje (zero linhas,
-- verificado a 2026-09-27) e nada lhe aponta uma chave estrangeira, logo apagá-la
-- seria seguro AGORA. Mas uma migração que apaga uma tabela é uma mina para quem
-- a correr mais tarde, quando já houver pedidos submetidos. O caminho por `ALTER`
-- dá o mesmo resultado hoje e continua correcto depois.
--
-- Idempotente: pode correr mais do que uma vez. Cada passo confirma o estado
-- antes de agir.
-- NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

-- ---------------------------------------------------------------------------
-- 1) Renomear as colunas que mudaram de nome, preservando o que lá estiver.
--    Renomear em vez de criar-e-copiar: mantém tipo, NOT NULL e as chaves
--    estrangeiras já existentes (`person_id` → people, `reviewed_by` → auth.users)
--    sem as ter de recriar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  par record;
BEGIN
  IF to_regclass('public.school_access_requests') IS NULL THEN
    RAISE NOTICE 'school_access_requests não existe; nada a reconciliar.';
    RETURN;
  END IF;

  FOR par IN
    SELECT * FROM (VALUES
      ('institutional_id'::text, 'institutional_number'::text),
      ('requested_role',         'requested_profile'),
      ('person_id',              'matched_person_id'),
      ('reviewed_by',            'reviewer_id'),
      ('review_note',            'decision_note')
    ) AS t(antigo, novo)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'school_access_requests'
        AND column_name = par.antigo
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'school_access_requests'
        AND column_name = par.novo
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.school_access_requests RENAME COLUMN %I TO %I',
        par.antigo, par.novo
      );
      RAISE NOTICE 'school_access_requests: % → %', par.antigo, par.novo;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Colunas que não existiam de forma nenhuma.
--    `contact_phone` e `message` vêm do formulário; `match_kind` diz COMO o
--    cadastro foi encontrado; `granted_role_code` e `membership_id` registam o
--    que a aprovação criou; `info_request_note` e `requester_reply` são a
--    conversa entre a secretaria e o requerente.
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_access_requests
  ADD COLUMN IF NOT EXISTS contact_phone     text,
  ADD COLUMN IF NOT EXISTS message           text,
  ADD COLUMN IF NOT EXISTS match_kind        text,
  ADD COLUMN IF NOT EXISTS granted_role_code text,
  ADD COLUMN IF NOT EXISTS membership_id     uuid,
  ADD COLUMN IF NOT EXISTS info_request_note text,
  ADD COLUMN IF NOT EXISTS requester_reply   text;

-- ---------------------------------------------------------------------------
-- 3) Largar as restrições de valor antigas ANTES de traduzir os valores.
--    Pela ordem inversa nada passaria: a antiga recusa 'aluno' e a nova recusa
--    'student', logo a tradução tem de correr sem nenhuma das duas a vigiar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_access_requests
  DROP CONSTRAINT IF EXISTS school_access_requests_requested_role_check,
  DROP CONSTRAINT IF EXISTS school_access_requests_requested_profile_check,
  DROP CONSTRAINT IF EXISTS school_access_requests_status_check;

-- ---------------------------------------------------------------------------
-- 4) Traduzir os valores. A produção usava inglês e nove estados; o código usa
--    português e seis.
--
--    Hoje isto não toca em linha nenhuma -- a tabela está vazia. Fica escrito
--    porque a migração pode ser aplicada depois de alguém submeter um pedido, e
--    então o mapeamento decide o que acontece a esse pedido.
--
--    Três estados antigos não têm equivalente directo, e a escolha é deliberada:
--    `preapproved` e `enrollment_pending` são pedidos a meio de uma decisão, não
--    decididos -- vão para `in_review`, que é onde a secretaria os volta a ver.
--    `enrollment_rejected` é uma decisão tomada, e negativa: `rejected`. Nenhum
--    deles vira `approved`, porque aprovar é o que cria o acesso à escola e isso
--    não se faz por conversão de texto.
-- ---------------------------------------------------------------------------
UPDATE public.school_access_requests
   SET requested_profile = CASE requested_profile
         WHEN 'student'  THEN 'aluno'
         WHEN 'teacher'  THEN 'professor'
         WHEN 'guardian' THEN 'encarregado'
         WHEN 'user'     THEN 'outro'
         ELSE requested_profile
       END
 WHERE requested_profile IN ('student', 'teacher', 'guardian', 'user');

UPDATE public.school_access_requests
   SET status = CASE status
         WHEN 'under_review'        THEN 'in_review'
         WHEN 'needs_information'   THEN 'info_requested'
         WHEN 'preapproved'         THEN 'in_review'
         WHEN 'enrollment_pending'  THEN 'in_review'
         WHEN 'enrollment_rejected' THEN 'rejected'
         ELSE status
       END
 WHERE status IN (
   'under_review', 'needs_information', 'preapproved',
   'enrollment_pending', 'enrollment_rejected'
 );

-- ---------------------------------------------------------------------------
-- 5) Pôr as restrições que o código pressupõe.
--    Os limites de comprimento não são decoração: `message` sem limite é um
--    campo de texto livre que qualquer pessoa autenticada grava.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_requested_profile_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_requested_profile_check
      CHECK (requested_profile IN ('aluno', 'professor', 'funcionario', 'encarregado', 'outro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_status_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_status_check
      CHECK (status IN ('pending', 'in_review', 'info_requested', 'approved', 'rejected', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_texto_limitado_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_texto_limitado_check
      CHECK (
        (national_id        IS NULL OR char_length(national_id)        <= 40)
        AND (institutional_number IS NULL OR char_length(institutional_number) <= 60)
        AND (contact_phone   IS NULL OR char_length(contact_phone)     <= 30)
        AND (message         IS NULL OR char_length(message)           <= 1000)
        AND (decision_note   IS NULL OR char_length(decision_note)     <= 1000)
        AND (info_request_note IS NULL OR char_length(info_request_note) <= 1000)
        AND (requester_reply IS NULL OR char_length(requester_reply)   <= 1000)
      );
  END IF;

  -- `membership_id` é coluna nova, logo a chave estrangeira também não existia.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_membership_id_fkey'
  ) AND to_regclass('public.school_memberships') IS NOT NULL THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_membership_id_fkey
      FOREIGN KEY (membership_id) REFERENCES public.school_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Nota sobre `full_name`: a produção tem
-- `school_access_requests_full_name_check`, que exige 3 a 160 caracteres DEPOIS
-- de cortar espaços. A migração canónica pede o mesmo sem o corte. Fica a da
-- produção, que é a mais exigente -- um nome de três espaços passaria na
-- canónica e não passa nesta. Trocá-la por uma versão mais frouxa seria perder
-- uma verificação sem ganhar nada.

-- ---------------------------------------------------------------------------
-- 6) Largar os três índices da versão antiga.
--    Ficam a par dos da versão nova, sobre as mesmas colunas: custo de escrita a
--    dobrar, e uma unicidade a mais cujo predicado fala de estados que já não
--    existem. Um índice único sobre valores que o CHECK agora recusa nunca
--    dispara -- parece proteger e não protege.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.school_access_requests_one_open;
DROP INDEX IF EXISTS public.school_access_requests_school_status;
DROP INDEX IF EXISTS public.school_access_requests_user;

-- ---------------------------------------------------------------------------
-- 7) Garantir os índices, o RLS e a política canónicos, tal como em
--    `20260925090000_school_access_requests.sql`. Já existem se essa migração
--    correu; repetem-se aqui para que esta possa correr sozinha.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_open_uidx
  ON public.school_access_requests (school_id, user_id)
  WHERE status IN ('pending', 'in_review', 'info_requested');

CREATE INDEX IF NOT EXISTS school_access_requests_school_status_idx
  ON public.school_access_requests (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS school_access_requests_user_idx
  ON public.school_access_requests (user_id, created_at DESC);

ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_access_requests FORCE ROW LEVEL SECURITY;

-- Escrita só pelo servidor, que valida a autorização em `requests-server.ts`.
-- O requerente lê os seus pedidos e mais nada: `matched_person_id` e
-- `match_kind` dizem que cadastro a escola encontrou, e isso é da secretaria.
REVOKE ALL ON public.school_access_requests FROM anon;
REVOKE ALL ON public.school_access_requests FROM authenticated;
GRANT SELECT ON public.school_access_requests TO authenticated;
GRANT ALL ON public.school_access_requests TO service_role;

DROP POLICY IF EXISTS "Requester reads own access requests" ON public.school_access_requests;
CREATE POLICY "Requester reads own access requests"
  ON public.school_access_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
