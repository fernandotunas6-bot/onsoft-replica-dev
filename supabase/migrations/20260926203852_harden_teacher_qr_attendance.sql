-- Presença docente por QR: avaliar a confiança ANTES de gastar o token.
--
-- Porquê: `redeemTeacherLessonQr` fazia três idas à base — ler a sessão, avaliar a
-- confiança, resgatar. Entre a avaliação e o resgate havia uma janela em que o mesmo
-- token podia ser usado, e a avaliação que autorizou o resgate não era a mesma
-- transacção que o executou. O código em produção desde 26/09 já chama
-- `hr_redeem_teacher_qr_secure`, que não existe: a leitura de QR falha desde então.
--
-- Como: compõe as duas funções existentes numa só transacção, em vez de reescrever a
-- lógica de resgate. O `hr_redeem_teacher_qr` já valida o que tem de validar — sessão
-- activa e não expirada com `FOR UPDATE`, ocorrência elegível, e que o `auth.uid()` é
-- mesmo o professor daquela aula («QR challenge belongs to another teacher»). Duplicar
-- essas regras aqui seria criar uma segunda verdade que amanhã diverge.
--
-- POR DECIDIR, e deliberadamente não resolvido: antes, a avaliação de confiança corria
-- numa chamada própria e a evidência de uma tentativa recusada ficava gravada. Agora,
-- como tudo corre numa transacção, o `RAISE` de uma recusa desfaz também a evidência
-- que a `hr_evaluate_teacher_attendance_assurance` grava. Ganha-se atomicidade e
-- perde-se o rasto das tentativas recusadas. Se esse rasto importar para auditoria,
-- tem de ser gravado fora desta transacção — não o fiz por ser decisão de quem manda
-- na auditoria, não minha.

CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr_secure(
  p_token_hash text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text,
  assurance_score integer,
  decision text,
  inside_geofence boolean,
  distance_from_school_m numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_assurance record;
  v_redeem record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN RAISE EXCEPTION 'Invalid QR token'; END IF;

  -- Só para saber o que avaliar: a ocorrência e o propósito. Sem bloqueio e sem
  -- decidir nada — quem valida estado, validade e dono é o resgate, logo a seguir.
  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;

  SELECT * INTO v_assurance
  FROM public.hr_evaluate_teacher_attendance_assurance(
    v_session.occurrence_id,
    v_session.purpose,
    p_latitude,
    p_longitude,
    p_accuracy_m
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance assurance produced no evaluation'; END IF;
  IF v_assurance.decision = 'reject' THEN
    RAISE EXCEPTION 'Attendance assurance rejected';
  END IF;

  SELECT * INTO v_redeem FROM public.hr_redeem_teacher_qr(p_token_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'QR redemption produced no attendance record'; END IF;

  RETURN QUERY
  SELECT
    v_redeem.occurrence_id,
    v_redeem.purpose,
    v_redeem.compensation_event_id,
    v_redeem.occurrence_status,
    v_assurance.assurance_score,
    v_assurance.decision,
    v_assurance.inside_geofence,
    v_assurance.distance_from_school_m;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_redeem_teacher_qr_secure(text,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr_secure(text,double precision,double precision,double precision) TO authenticated;
