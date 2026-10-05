-- Presença do professor por QR: só a versão endurecida é chamável pelo cliente.
--
-- `hr_redeem_teacher_qr_secure` avalia a confiança (geofence, QR activo) e só depois
-- resgata o token, numa transacção. Mas as duas funções que ela compõe continuavam
-- abertas a `authenticated` em /rest/v1/rpc: chamar `hr_redeem_teacher_qr` directamente
-- marcava a presença (e gerava o evento de pagamento da aula) sem a avaliação — bastava
-- ter o QR, por exemplo numa fotografia enviada por um colega.
--
-- O código da app só chama `hr_redeem_teacher_qr_secure` (src/features/hr/teacher-lessons.ts).
-- As três são SECURITY DEFINER do `postgres`, por isso a versão endurecida continua a
-- chamar as internas com os direitos do dono. Aplicada em produção a 2026-10-05.
-- Idempotente. Não mexe em dados.

REVOKE ALL ON FUNCTION public.hr_redeem_teacher_qr(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) TO service_role;
