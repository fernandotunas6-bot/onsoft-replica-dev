-- Pacote para o SQL Editor do projecto xodgfmxiaunpamctfeea (produção). Aplicar só com decisão do dono.
-- Migração 20261012100000_enrollment_cycle_guard (ciclos de matrícula na base). Idempotente.

-- Ciclos de matrícula também na base (auditoria 14, segunda passagem).
--
-- O servidor só aceita matrículas novas dentro do ciclo de matrículas e nunca durante um
-- período de aulas (src/features/students/enrollment-cycle.ts); fora disso, só a
-- Administração, com motivo. Quem chamasse enroll_student directamente pela API (com 2FA e
-- a permissão) passava por cima. Este gatilho fecha esse caminho:
--
--   · matrícula nova (INSERT) de uma conta: recusada se hoje cai num período de aulas
--     (`terms` do ano da matrícula) ou, havendo ciclos em school_settings/enrollment, fora
--     de todos eles;
--   · a Administração da escola passa (o motivo exige-o o servidor e fica em audit_logs);
--   · escritas sem utilizador (chave de serviço, scripts) não são afectadas;
--   · mudar de turma e confirmar matrículas (UPDATE) não passam por aqui.
--
-- Mesma regra que o código: «hoje» é a data de Luanda. Idempotente. Não mexe em dados.

CREATE OR REPLACE FUNCTION private.enrollment_window_open(
  target_school_id uuid,
  target_academic_year_id uuid,
  target_day date
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cycles as (
    select c.value as cycle
    from public.school_settings s,
         jsonb_array_elements(
           case when jsonb_typeof(s.value -> 'cycles') = 'array' then s.value -> 'cycles'
                else '[]'::jsonb end
         ) as c(value)
    where s.school_id = target_school_id and s.domain = 'enrollment'
      and (c.value ->> 'opens_on') ~ '^\d{4}-\d{2}-\d{2}$'
      and (c.value ->> 'closes_on') ~ '^\d{4}-\d{2}-\d{2}$'
  )
  select not exists (
           select 1 from public.terms t
           where t.school_id = target_school_id
             and t.academic_year_id = target_academic_year_id
             and target_day between t.starts_on and t.ends_on
         )
     and (
           not exists (select 1 from cycles)
           or exists (
             select 1 from cycles
             where target_day between (cycle ->> 'opens_on')::date and (cycle ->> 'closes_on')::date
           )
         );
$function$;

REVOKE ALL ON FUNCTION private.enrollment_window_open(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_enrollment_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  -- Papel pela escola da linha, sempre com is_school_member (DATABASE_RULES, 6d).
  if public.is_school_member(new.school_id)
     and coalesce(private.sga_app_role(new.school_id), '') = 'Administrador' then
    return new;
  end if;
  if not private.enrollment_window_open(
    new.school_id,
    new.academic_year_id,
    (now() at time zone 'Africa/Luanda')::date
  ) then
    raise exception using errcode = '22023',
      message = 'Fora do período de matrículas: só a Administração matricula fora do ciclo.';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.guard_enrollment_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_enrollment_cycle ON public.enrollments;
CREATE TRIGGER guard_enrollment_cycle BEFORE INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.guard_enrollment_cycle();

-- ══════════ Confirmar ══════════
select case when exists (select 1 from pg_trigger where tgname = 'guard_enrollment_cycle' and not tgisinternal) then 'aplicada' else 'por aplicar' end as enrollment_cycle_guard;
