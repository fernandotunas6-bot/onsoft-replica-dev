-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-05
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: mudar um aluno de turma no mesmo ano lectivo. Hoje «Alterar turma», a
-- atribuição em lote e a importação de matrículas falham sempre que a turma muda
-- («Identidade da matrícula é imutável.»). Depois: a turma muda se for do mesmo ano e
-- estiver activa, e a lotação da turma é respeitada. Não mexe em dados.
-- Ensaiado em PGlite (tests/sql/enrollment-class-change.mjs): corre duas vezes.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261005160000_enrollment_class_change.sql ══════════
-- Mudar um aluno de turma no mesmo ano lectivo, com as vagas da turma.
--
-- Até 2026-10-05 o gatilho private.protect_enrollment_identity tratava a turma como
-- parte da identidade da matrícula e recusava qualquer UPDATE de class_group_id
-- («Identidade da matrícula é imutável.»). Por isso «Alterar turma» na ficha do aluno,
-- a atribuição em lote a alunos já matriculados e a importação de matrículas com
-- «actualizar» falhavam sempre que a turma mudava: nas 36 matrículas da produção
-- (leitura de 2026-10-05) nunca houve uma mudança de turma gravada.
--
-- Mudar de turma dentro do ano é uma operação normal e tem de manter a matrícula: as
-- notas, as presenças e o contrato financeiro estão ligados a ela. Agora:
--   · a turma pode mudar, se a nova for da mesma escola e do mesmo ano lectivo da
--     matrícula e estiver activa;
--   · ocupar um lugar (mudar de turma, ou voltar a pending/active) respeita a lotação,
--     com a mesma regra de private.enroll_student: pending e active contam, e a turma
--     fica bloqueada (FOR UPDATE) enquanto se conta;
--   · o resto da identidade (escola, ano, aluno, número, criação) continua imutável.
--
-- SECURITY DEFINER para contar as vagas sem depender da RLS de quem grava; corre só
-- como gatilho (BEFORE UPDATE). Idempotente. Não mexe em dados.

CREATE OR REPLACE FUNCTION private.protect_enrollment_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_group public.class_groups%rowtype;
  occupied_places integer;
begin
  if new.id <> old.id or new.school_id <> old.school_id
     or new.academic_year_id <> old.academic_year_id
     or new.student_id <> old.student_id
     or new.enrollment_number <> old.enrollment_number
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'Identidade da matrícula é imutável.';
  end if;

  -- Ocupa um lugar: mudou de turma, ou passou a pending/active vindo de outro estado.
  if new.status in ('pending', 'active')
     and (new.class_group_id is distinct from old.class_group_id
          or old.status not in ('pending', 'active')) then
    select * into target_group from public.class_groups
    where school_id = new.school_id and id = new.class_group_id
    for update;
    if target_group.id is null or target_group.academic_year_id <> new.academic_year_id then
      raise exception using errcode = '22023',
        message = 'A turma nova tem de ser da mesma escola e do mesmo ano lectivo da matrícula.';
    end if;
    if new.class_group_id is distinct from old.class_group_id and target_group.status <> 'active' then
      raise exception using errcode = '22023', message = 'Turma ativa inválida para esta escola.';
    end if;
    select count(*) into occupied_places from public.enrollments
    where school_id = new.school_id and class_group_id = new.class_group_id
      and status in ('pending', 'active') and id <> new.id;
    if occupied_places >= target_group.capacity then
      raise exception using errcode = '23514', message = 'A turma atingiu a capacidade configurada.';
    end if;
  end if;

  new.end_reason := nullif(btrim(new.end_reason), '');
  new.updated_at := now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.protect_enrollment_identity() FROM PUBLIC, anon, authenticated;


-- ══════════ Confirmar ══════════
SELECT CASE
  WHEN coalesce(position('A turma atingiu a capacidade' in pg_get_functiondef(
         to_regprocedure('private.protect_enrollment_identity()'))) > 0, false)
    THEN 'aplicada'
  ELSE 'por aplicar'
END AS "20261005160000 mudar de turma";
