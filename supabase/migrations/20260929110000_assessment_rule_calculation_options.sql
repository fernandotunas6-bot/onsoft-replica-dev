-- Opções de cálculo do modelo de avaliação, escolhidas pelo director.
--
-- Até aqui eram regras fixas no código:
--   * NPP: "já incluída no MAC" (Decreto 424/25) ou "conta na parte contínua,
--     com o MAC";
--   * recurso: média entre a nota anterior e a de recurso, a de recurso
--     substitui, ou fica a maior.
-- Passam a ser um parâmetro opcional `calculation_options`, guardado em
-- `formula.calculation`. Omitido, fica `{}` e a aplicação usa as omissões do
-- Decreto 424/25, o comportamento de sempre.
--
-- Corpo igual ao da função em produção (lido a 2026-09-29), salvo o parâmetro
-- novo e a chave `calculation`. As permissões mantêm-se: só a chave de
-- serviço executa (o servidor valida o papel e o 2FA). Idempotente.

DROP FUNCTION IF EXISTS public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
);
DROP FUNCTION IF EXISTS private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
);

CREATE OR REPLACE FUNCTION private.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb,
  calculation_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  active_scale public.grading_scales%rowtype;
  next_version integer;
  new_rule_id uuid;
  key_subject uuid;
begin
  if target_school_id is null or actor is null then
    raise exception using errcode = '22023', message = 'Escola e autor são obrigatórios.';
  end if;

  -- Uma publicação de cada vez por escola.
  perform pg_advisory_xact_lock(hashtext('siga_publish_assessment_rule:' || target_school_id::text));

  select * into active_scale from public.grading_scales
  where school_id = target_school_id and is_active
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Escala de notas activa em falta.';
  end if;

  if continuous_weight_value < 0 or exam_weight_value < 0
     or continuous_weight_value + exam_weight_value <> 100
     or passing_grade_value < active_scale.minimum_value
     or passing_grade_value > active_scale.maximum_value
     or maximum_absence_value < 0 or maximum_absence_value > 100
     or rounding_method_value not in ('none', 'nearest', 'up', 'down') then
    raise exception using errcode = '22023', message = 'Parâmetros de regra inválidos.';
  end if;

  if coalesce(calculation_options->>'nppMode', 'in_mac') not in ('in_mac', 'in_continuous')
     or coalesce(calculation_options->>'recoveryMethod', 'average') not in ('average', 'replace', 'max') then
    raise exception using errcode = '22023', message = 'Opções de cálculo inválidas.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_rule_sets
  where school_id = target_school_id and code = 'DEFAULT';

  update public.assessment_rule_sets
  set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';

  insert into public.assessment_rule_sets (
    school_id, grading_scale_id, code, name, version, status, continuous_weight, exam_weight,
    passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval,
    lock_after_publication, formula, created_by
  ) values (
    target_school_id, active_scale.id, 'DEFAULT',
    coalesce(nullif(btrim(rule_name), ''), 'Regra principal de avaliação'),
    next_version, 'active',
    continuous_weight_value, exam_weight_value, passing_grade_value, maximum_absence_value,
    rounding_method_value, require_change_approval, lock_after_publication_value,
    jsonb_build_object(
      'operation', 'weighted_average',
      'components', jsonb_build_array(
        jsonb_build_object('code', 'continuous', 'weight', continuous_weight_value),
        jsonb_build_object('code', 'exam', 'weight', exam_weight_value)
      ),
      'keySubjectsCauseFailure', key_subjects_cause_failure,
      'promotion', coalesce(promotion_rules, '{}'::jsonb),
      'calculation', coalesce(calculation_options, '{}'::jsonb),
      'scale', jsonb_build_object(
        'minimum', active_scale.minimum_value,
        'maximum', active_scale.maximum_value,
        'passing', passing_grade_value,
        'decimalPlaces', active_scale.decimal_places
      )
    ),
    actor
  ) returning id into new_rule_id;

  foreach key_subject in array coalesce(key_subject_ids, '{}') loop
    if not exists (
      select 1 from public.subjects
      where school_id = target_school_id and id = key_subject and status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Disciplina-chave inválida.';
    end if;
    insert into public.assessment_key_subjects (school_id, rule_set_id, subject_id)
    values (target_school_id, new_rule_id, key_subject)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ruleSetId', new_rule_id, 'version', next_version, 'status', 'active');
end;
$function$;

CREATE OR REPLACE FUNCTION public.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb,
  calculation_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  select private.siga_publish_assessment_rule(
    target_school_id, actor, rule_name, continuous_weight_value, exam_weight_value,
    passing_grade_value, maximum_absence_value, rounding_method_value,
    require_change_approval, lock_after_publication_value, key_subject_ids,
    key_subjects_cause_failure, promotion_rules, calculation_options
  );
$function$;

REVOKE ALL ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb
) TO service_role;
REVOKE ALL ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb, jsonb
) TO service_role;
