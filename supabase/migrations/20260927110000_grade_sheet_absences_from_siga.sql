-- Pauta oficial: faltas a partir da chamada do SIGA.
--
-- `private.build_grade_sheet` calcula a percentagem de faltas em
-- `attendance_records` / `attendance_sessions`, mas a chamada do SIGA grava em
-- `siga_attendance_records` / `siga_attendance_sessions`. Resultado: a
-- percentagem saía 0 e a pauta nunca reprovava por faltas.
--
-- A função não é substituída inteira (a versão do repositório foi capturada a
-- 2026-09-08 e a produção pode ter mudado). Lê-se a definição que está na base
-- e troca-se só o bloco das faltas: passa a contar primeiro as presenças do
-- SIGA (faltas ÷ aulas registadas, sem as justificadas) e, só se o aluno não
-- tiver nenhuma, o cálculo antigo. Se o bloco não estiver como esperado, nada
-- é alterado e fica um aviso (NOTICE). Pode correr-se mais do que uma vez.

DO $migration$
DECLARE
  fn regprocedure;
  current_def text;
  patched_def text;
  pattern text := 'select coalesce\(\s*\(\s*select \(count\(\*\) filter \(where ar\.status in \(''absent''\)\)::numeric \* 100\)(.*?from public\.attendance_records ar.*?and ar\.status <> ''excused''\s*)\),\s*0\s*\) into absence_pct;';
  replacement text := 'select coalesce(
      (
        select (count(*) filter (where sr.status = ''absent'')::numeric * 100)
               / nullif(count(*), 0)
        from public.siga_attendance_records sr
        join public.siga_attendance_sessions ss on ss.school_id = sr.school_id and ss.id = sr.session_id
        join public.enrollments en on en.school_id = sr.school_id and en.student_id = sr.student_id
        where sr.school_id = target_school_id
          and en.id = enrollment_row.id
          and ss.class_group_id = target_class_group_id
          and sr.status <> ''excused''
      ),
      (
        select (count(*) filter (where ar.status in (''absent''))::numeric * 100)\1),
      0
    ) into absence_pct;';
BEGIN
  fn := to_regprocedure('private.build_grade_sheet(uuid, uuid, uuid, text)');
  IF fn IS NULL THEN
    RAISE NOTICE 'build_grade_sheet: função não encontrada; nada alterado.';
    RETURN;
  END IF;

  current_def := pg_get_functiondef(fn);
  IF position('siga_attendance_records' in current_def) > 0 THEN
    RAISE NOTICE 'build_grade_sheet: já lê as presenças do SIGA; nada alterado.';
    RETURN;
  END IF;

  patched_def := regexp_replace(current_def, pattern, replacement);
  IF patched_def = current_def THEN
    RAISE NOTICE 'build_grade_sheet: bloco das faltas diferente do esperado; nada alterado.';
    RETURN;
  END IF;

  EXECUTE patched_def;
  RAISE NOTICE 'build_grade_sheet: faltas passam a vir da chamada do SIGA.';
END
$migration$;
