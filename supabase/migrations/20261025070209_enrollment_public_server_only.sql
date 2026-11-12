-- Matrícula pública: só pelo servidor.
--
-- Leitura de 2026-10-18: `anon` podia gravar candidaturas directamente pela API
-- (política «Public insert open enrollment applications» e INSERT por coluna) e ler os
-- formulários abertos (política «Public read open enrollment forms»). Com a chave anon,
-- que é pública, um ciclo de POST a /rest/v1/enrollment_applications enchia a lista da
-- secretaria sem passar por `submitPublicEnrollment`: sem o limite de 10 por hora por
-- IP, sem o bloqueio da escola suspensa e sem a validação dos dados.
--
-- Nenhum código usa este caminho: o formulário público lê e grava pelo servidor, com a
-- chave de serviço. As políticas de leitura da secretaria (authenticated) ficam.
-- Não mexe em dados. Idempotente.

DROP POLICY IF EXISTS "Public insert open enrollment applications" ON public.enrollment_applications;
DROP POLICY IF EXISTS "Public read open enrollment forms" ON public.enrollment_forms;
REVOKE ALL ON public.enrollment_applications FROM anon;
REVOKE ALL ON public.enrollment_forms FROM anon;
REVOKE INSERT (school_id, form_id, full_name, payload, status)
  ON public.enrollment_applications FROM anon;
