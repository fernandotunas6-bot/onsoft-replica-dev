-- SIGA Plus — Anexos do processo individual de docentes.
-- Os identificadores e códigos originais de public.siga_files ficam intactos.
-- Não executar em produção até aprovar migração e testes de isolamento tenant.
CREATE TABLE IF NOT EXISTS public.teacher_document_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  person_id uuid NOT NULL REFERENCES public.people(id),
  file_id uuid NOT NULL REFERENCES public.siga_files(id),
  document_code text NOT NULL CHECK (
    document_code IN (
      'bi','habilitacoes','docencia','cv','contrato','nif','iban','foto',
      'registo_criminal','atestado_medico','vacinas','situacao_militar',
      'inaarees','formacao_pedagogica','declaracao_servico','requerimento',
      'experiencia','autorizacao_acumulacao','pos_graduacao','prova_pedagogica'
    )
  ),
  validation_status text NOT NULL DEFAULT 'received'
    CHECK (validation_status IN ('received','verified','rejected')),
  validation_notes text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT teacher_document_entries_file_school_uq UNIQUE(school_id, file_id),
  CONSTRAINT teacher_document_entries_review_consistency CHECK (
    (validation_status = 'received' AND verified_at IS NULL AND verified_by IS NULL)
    OR (validation_status IN ('verified','rejected') AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS teacher_document_entries_person_idx
  ON public.teacher_document_entries (school_id, teacher_id, document_code, created_at DESC);

-- O servidor autentica/autoriza cada operação antes de utilizar service_role.
-- Não se autoriza leitura directa por membro, incluindo docente, pois há dados
-- pessoais de recrutamento, remuneração e potencialmente dados médicos.
ALTER TABLE public.teacher_document_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_document_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_document_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.teacher_document_entries TO service_role;

CREATE OR REPLACE FUNCTION public.teacher_document_entries_assert_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teachers t
      JOIN public.people p ON p.id = t.person_id
      JOIN public.siga_files f ON f.id = NEW.file_id
     WHERE t.id = NEW.teacher_id AND t.school_id = NEW.school_id
       AND p.id = NEW.person_id AND p.school_id = NEW.school_id
       AND f.school_id = NEW.school_id AND f.related_person_id = NEW.person_id
       AND f.area = 'secretaria' AND f.visibility = 'private'
       AND f.storage_backend = 'sga' AND f.deleted_at IS NULL
       AND f.is_folder = false AND f.is_system = false
  ) THEN
    RAISE EXCEPTION 'Anexo docente incompatível com escola, pessoa ou arquivo reservado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_document_entries_scope_guard
  ON public.teacher_document_entries;
CREATE TRIGGER teacher_document_entries_scope_guard
  BEFORE INSERT OR UPDATE OF school_id, teacher_id, person_id, file_id
  ON public.teacher_document_entries
  FOR EACH ROW EXECUTE FUNCTION public.teacher_document_entries_assert_scope();

COMMENT ON TABLE public.teacher_document_entries IS
  'Processo documental reservado do docente. Preserva os códigos originais dos ficheiros e exige revisão explícita.';
NOTIFY pgrst, 'reload schema';
